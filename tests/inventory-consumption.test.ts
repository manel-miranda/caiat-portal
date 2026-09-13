/**
 * Food order → inventory consumption: deduction happens exactly once.
 *
 * The whole guarantee lives in the database:
 *   - `preview_food_order_set_status` calls `inventory_consume_preview_order`
 *     on every transition to `delivered`;
 *   - `inventory_consume_preview_order` inserts one consumption movement per
 *     ingredient with `ON CONFLICT (source_type, source_id, inventory_item_id)
 *     WHERE source_id IS NOT NULL DO NOTHING`;
 *   - the partial unique index `inventory_movements_source_unique` is what
 *     makes that conflict clause fire.
 *
 * These tests run the real migrations against a throwaway PostgreSQL database
 * and exercise the real RPCs, so a change to any of those three pieces — the
 * index, the conflict target, or the status RPC — fails here.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SQL } from "bun";
import {
  actAs,
  createPreviewOrder,
  createStaffUser,
  createTestDatabase,
  databaseAvailable,
  expectedConsumption,
  movementIdsForOrder,
  movementsForOrder,
  round,
  stockByKey,
  type OrderLine,
  type TestDatabase,
} from "./support/preview-db";

/** Two dishes that share `demo_onions`, so the per-ingredient rollup is covered. */
const ORDER: OrderLine[] = [
  { dish: "demo_chicken_tajine", quantity: 2 },
  { dish: "demo_couscous", quantity: 1 },
];

const canRun = databaseAvailable();
const suite = canRun ? describe : describe.skip;

suite("food order delivery → inventory consumption", () => {
  let db: TestDatabase;
  let sql: SQL;
  let staffId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = db.sql;
    staffId = await createStaffUser(sql, "kitchen_staff");
    await actAs(sql, staffId);
  });

  afterAll(async () => {
    await db?.drop();
  });

  test("marking an order Delivered deducts the recipe ingredients once", async () => {
    const orderId = await createPreviewOrder(sql, ORDER);
    const expected = await expectedConsumption(sql, ORDER);
    const before = await stockByKey(sql);

    // Anchor against hand-computed values from the seeded demo recipes, so the
    // test does not simply agree with itself: 2 × tajine needs 0.70 kg chicken,
    // and onions (0.10/portion in both dishes) roll up to 2 × 0.10 + 1 × 0.10.
    expect(round(expected["demo_chicken"] ?? 0)).toBe(0.7);
    expect(round(expected["demo_onions"] ?? 0)).toBe(0.3);

    await sql`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`;

    const movements = await movementsForOrder(sql, orderId);
    expect(movements.length).toBe(Object.keys(expected).length);

    for (const movement of movements) {
      expect(movement.movement_type).toBe("consumption");
      expect(movement.source_type).toBe("preview_food_order");
      expect(movement.source_id).toBe(orderId);
      expect(round(movement.quantity)).toBe(round(-(expected[movement.item_key] ?? 0)));
    }

    // The forecast view the Stock screen reads moves by exactly the same amount.
    const after = await stockByKey(sql);
    for (const [key, used] of Object.entries(expected)) {
      expect(round((after[key] ?? 0) - (before[key] ?? 0))).toBe(round(-used));
    }
  });

  test("repeating the Delivered action does not deduct a second time", async () => {
    const orderId = await createPreviewOrder(sql, ORDER);
    await sql`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`;

    const idsAfterFirst = await movementIdsForOrder(sql, orderId);
    const stockAfterFirst = await stockByKey(sql);

    await sql`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`;
    await sql`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`;

    // Same ledger rows, not replacements: no row was added, removed or rewritten.
    expect(await movementIdsForOrder(sql, orderId)).toEqual(idsAfterFirst);
    expect(await stockByKey(sql)).toEqual(stockAfterFirst);
  });

  test("reprocessing the same order is a no-op", async () => {
    const orderId = await createPreviewOrder(sql, ORDER);

    const [first] =
      await sql`SELECT public.inventory_consume_preview_order(${orderId}) AS inserted`;
    const inserted = Number((first as { inserted: number }).inserted);
    expect(inserted).toBeGreaterThan(0);

    const idsAfterFirst = await movementIdsForOrder(sql, orderId);
    const stockAfterFirst = await stockByKey(sql);

    // Whatever replays the consumption — a retried RPC, a reload that re-fires
    // the mutation, a server-side reprocess — writes nothing further.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const [replay] =
        await sql`SELECT public.inventory_consume_preview_order(${orderId}) AS inserted`;
      expect(Number((replay as { inserted: number }).inserted)).toBe(0);
    }

    expect(await movementIdsForOrder(sql, orderId)).toEqual(idsAfterFirst);
    expect(await stockByKey(sql)).toEqual(stockAfterFirst);
  });

  test("walking the order back through the flow and delivering again deducts once", async () => {
    const orderId = await createPreviewOrder(sql, ORDER);
    await sql`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`;

    const idsAfterFirst = await movementIdsForOrder(sql, orderId);
    const stockAfterFirst = await stockByKey(sql);

    for (const status of ["preparing", "accepted", "preparing", "delivered"]) {
      await sql`SELECT public.preview_food_order_set_status(${orderId}, ${status})`;
    }

    expect(await movementIdsForOrder(sql, orderId)).toEqual(idsAfterFirst);
    expect(await stockByKey(sql)).toEqual(stockAfterFirst);
  });

  test("two staff delivering the same order at once still deduct once", async () => {
    const orderId = await createPreviewOrder(sql, ORDER);
    const expected = await expectedConsumption(sql, ORDER);

    const one = db.connect();
    const two = db.connect();
    await actAs(one, staffId);
    await actAs(two, staffId);

    await Promise.all([
      one`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`,
      two`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`,
    ]);

    const movements = await movementsForOrder(sql, orderId);
    expect(movements.length).toBe(Object.keys(expected).length);
    for (const movement of movements) {
      expect(round(movement.quantity)).toBe(round(-(expected[movement.item_key] ?? 0)));
    }
  });

  test("each order is deducted on its own — idempotency is per order", async () => {
    const first = await createPreviewOrder(sql, ORDER);
    const second = await createPreviewOrder(sql, ORDER);
    const expected = await expectedConsumption(sql, ORDER);
    const before = await stockByKey(sql);

    await sql`SELECT public.preview_food_order_set_status(${first}, 'delivered')`;
    await sql`SELECT public.preview_food_order_set_status(${second}, 'delivered')`;

    const after = await stockByKey(sql);
    for (const [key, used] of Object.entries(expected)) {
      expect(round((after[key] ?? 0) - (before[key] ?? 0))).toBe(round(-used * 2));
    }
  });

  test("manual movements are not collapsed by the order idempotency key", async () => {
    const [item] = await sql`SELECT id FROM public.inventory_items WHERE key = 'demo_onions'`;
    const itemId = String((item as { id: string }).id);
    const before = (await stockByKey(sql))["demo_onions"] ?? 0;

    // Manual movements carry source_id IS NULL, which the partial unique index
    // deliberately excludes — two identical receipts must both land.
    await sql`SELECT public.inventory_receive(${itemId}, 3, NULL, 'market run')`;
    await sql`SELECT public.inventory_receive(${itemId}, 3, NULL, 'market run')`;

    const after = (await stockByKey(sql))["demo_onions"] ?? 0;
    expect(round(after - before)).toBe(6);
  });

  test("direct consumption RPC rejects an authenticated user without requests_manage", async () => {
    const orderId = await createPreviewOrder(sql, ORDER);
    const [outsider] = await sql`
      INSERT INTO auth.users (email) VALUES ('inventory-outsider@example.test') RETURNING id
    `;
    const outsiderId = String((outsider as { id: string }).id);

    await actAs(sql, outsiderId);
    try {
      await expect(
        sql`SELECT public.inventory_consume_preview_order(${orderId})`,
      ).rejects.toThrow("PERMISSION_DENIED");
      expect(await movementsForOrder(sql, orderId)).toEqual([]);
    } finally {
      await actAs(sql, staffId);
    }
  });
});

/**
 * Current behaviour on cancellation, pinned so a future change is a deliberate one.
 *
 * The implementation has no reversal path: `preview_food_order_set_status`
 * consumes on `delivered` and does nothing on `cancelled`. Cancelling an order
 * that was already delivered therefore leaves the consumption in the ledger,
 * and re-delivering it does not deduct again. Reversal, if it is ever wanted,
 * is a product decision — these tests only record what happens today.
 */
suite("cancelling after delivery (no reversal implemented)", () => {
  let db: TestDatabase;
  let sql: SQL;

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = db.sql;
    await actAs(sql, await createStaffUser(sql, "kitchen_staff"));
  });

  afterAll(async () => {
    await db?.drop();
  });

  test("cancelling a delivered order leaves the deduction in place", async () => {
    const orderId = await createPreviewOrder(sql, ORDER);
    await sql`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`;

    const idsAfterDelivery = await movementIdsForOrder(sql, orderId);
    const stockAfterDelivery = await stockByKey(sql);

    await sql`SELECT public.preview_food_order_set_status(${orderId}, 'cancelled')`;

    // No reversal movement is written, and nothing is deleted either.
    expect(await movementIdsForOrder(sql, orderId)).toEqual(idsAfterDelivery);
    expect(await stockByKey(sql)).toEqual(stockAfterDelivery);
  });

  test("delivering again after a cancellation does not deduct twice", async () => {
    const orderId = await createPreviewOrder(sql, ORDER);
    await sql`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`;
    const stockAfterDelivery = await stockByKey(sql);

    await sql`SELECT public.preview_food_order_set_status(${orderId}, 'cancelled')`;
    await sql`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`;

    expect(await stockByKey(sql)).toEqual(stockAfterDelivery);
  });

  test("cancelling an order that was never delivered deducts nothing", async () => {
    const orderId = await createPreviewOrder(sql, ORDER);
    const before = await stockByKey(sql);

    await sql`SELECT public.preview_food_order_set_status(${orderId}, 'cancelled')`;

    expect(await movementsForOrder(sql, orderId)).toEqual([]);
    expect(await stockByKey(sql)).toEqual(before);
  });
});
