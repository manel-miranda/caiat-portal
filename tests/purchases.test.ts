/**
 * Suppliers + purchases regression tests.
 *
 * Runs the real migrations against a throwaway PostgreSQL database and calls
 * the supported purchase RPC: a purchase must create exactly one receipt
 * movement per ingredient, increase estimated stock once, reject malformed
 * payloads, and stay closed to users without `requests_manage` and to anon.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SQL } from "bun";
import {
  actAs,
  createStaffUser,
  createTestDatabase,
  databaseAvailable,
  round,
  stockByKey,
  type TestDatabase,
} from "./support/preview-db";

const canRun = databaseAvailable();
const suite = canRun ? describe : describe.skip;

type Line = { inventory_item_id: string; quantity: number; unit_cost: number };

suite("suppliers and purchases", () => {
  let db: TestDatabase;
  let sql: SQL;
  let staffId: string;
  let outsiderSql: SQL;
  let anonSql: SQL;

  async function itemId(key: string): Promise<string> {
    const [row] = await sql`SELECT id FROM public.inventory_items WHERE key = ${key}`;
    return String((row as { id: string }).id);
  }

  async function createPurchase(lines: Line[], supplier: string | null = null): Promise<string> {
    const [gen] = await sql`SELECT gen_random_uuid() AS id`;
    const purchaseId = String((gen as { id: string }).id);
    const [row] = await sql`
      SELECT public.inventory_record_purchase(
        ${purchaseId}::uuid, ${supplier}::uuid, now(), 'test purchase',
        ${JSON.stringify(lines)}::text::jsonb
      ) AS id
    `;
    return String((row as { id: string }).id);
  }

  async function movementsFor(purchaseId: string) {
    const rows = await sql`
      SELECT i.key AS item_key, m.movement_type, m.quantity::float8 AS quantity,
             m.unit_cost::float8 AS unit_cost, m.source_type
        FROM public.inventory_movements m
        JOIN public.inventory_items i ON i.id = m.inventory_item_id
       WHERE m.source_id = ${purchaseId}
       ORDER BY i.key
    `;
    return rows as unknown as {
      item_key: string;
      movement_type: string;
      quantity: number;
      unit_cost: number | null;
      source_type: string;
    }[];
  }

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = db.sql;
    staffId = await createStaffUser(sql, "purchase_staff");
    await actAs(sql, staffId);

    const [outsider] = await sql`
      INSERT INTO auth.users (email) VALUES ('purchase-outsider@example.test') RETURNING id
    `;
    outsiderSql = db.connect();
    await actAs(outsiderSql, String((outsider as { id: string }).id));
    anonSql = db.connect();
  });

  afterAll(async () => {
    await db?.drop();
  });

  test("a purchase creates one receipt per item and raises stock exactly once", async () => {
    const onions = await itemId("demo_onions");
    const before = (await stockByKey(sql))["demo_onions"] ?? 0;
    const purchaseId = await createPurchase([
      { inventory_item_id: onions, quantity: 4, unit_cost: 15 },
    ]);

    const movements = await movementsFor(purchaseId);
    expect(movements.length).toBe(1);
    expect(movements[0]?.movement_type).toBe("receipt");
    expect(movements[0]?.source_type).toBe("purchase");
    expect(movements[0]?.quantity).toBe(4);
    expect(movements[0]?.unit_cost).toBe(15);

    const after = (await stockByKey(sql))["demo_onions"] ?? 0;
    expect(round(after - before)).toBe(4);

    const [purchase] = await sql`
      SELECT total_cost::float8 AS total_cost, line_count FROM public.purchases WHERE id = ${purchaseId}
    `;
    expect((purchase as { total_cost: number }).total_cost).toBe(60);
    expect(Number((purchase as { line_count: number }).line_count)).toBe(1);
  });

  test("multiple lines are stored and totalled correctly", async () => {
    const supplierName = "Souk El Had";
    const [supplier] = await sql`
      SELECT public.supplier_upsert(NULL, ${supplierName}, '+212600000000', 'Agadir', NULL, true) AS id
    `;
    const supplierId = String((supplier as { id: string }).id);

    const tomatoes = await itemId("demo_tomatoes");
    const eggs = await itemId("demo_eggs");
    const purchaseId = await createPurchase(
      [
        { inventory_item_id: tomatoes, quantity: 2, unit_cost: 15 },
        { inventory_item_id: eggs, quantity: 30, unit_cost: 1.5 },
      ],
      supplierId,
    );

    const movements = await movementsFor(purchaseId);
    expect(movements.map((m) => m.item_key)).toEqual(["demo_eggs", "demo_tomatoes"]);
    expect(movements.map((m) => m.quantity)).toEqual([30, 2]);

    const [purchase] = await sql`
      SELECT total_cost::float8 AS total_cost, line_count, supplier_id
        FROM public.purchases WHERE id = ${purchaseId}
    `;
    expect((purchase as { total_cost: number }).total_cost).toBe(75);
    expect(Number((purchase as { line_count: number }).line_count)).toBe(2);
    expect(String((purchase as { supplier_id: string }).supplier_id)).toBe(supplierId);
  });

  test("duplicate lines for one item are rejected instead of silently combined", async () => {
    const bread = await itemId("demo_bread");
    const [gen] = await sql`SELECT gen_random_uuid() AS id`;
    const purchaseId = String((gen as { id: string }).id);
    const lines = JSON.stringify([
      { inventory_item_id: bread, quantity: 5, unit_cost: 2 },
      { inventory_item_id: bread, quantity: 3, unit_cost: 2 },
    ]);

    let denied = false;
    try {
      await sql`
        SELECT public.inventory_record_purchase(
          ${purchaseId}::uuid, NULL, now(), NULL, ${lines}::text::jsonb
        )
      `;
    } catch (error) {
      denied = true;
      expect(String(error)).toContain("DUPLICATE_ITEM");
    }
    expect(denied).toBe(true);

    const [purchase] = await sql`
      SELECT count(*)::int AS n FROM public.purchases WHERE id = ${purchaseId}
    `;
    expect(Number((purchase as { n: number }).n)).toBe(0);
    expect(await movementsFor(purchaseId)).toEqual([]);
  });

  test("an authenticated user without requests_manage cannot write suppliers or purchases", async () => {
    const onions = await itemId("demo_onions");

    let supplierDenied = false;
    try {
      await outsiderSql`SELECT public.supplier_upsert(NULL, 'Sneaky', NULL, NULL, NULL, true)`;
    } catch (error) {
      supplierDenied = true;
      expect(String(error)).toContain("PERMISSION_DENIED");
    }
    expect(supplierDenied).toBe(true);

    const lines = JSON.stringify([{ inventory_item_id: onions, quantity: 1, unit_cost: 1 }]);
    let purchaseDenied = false;
    try {
      await outsiderSql`
        SELECT public.inventory_record_purchase(
          gen_random_uuid(), NULL, now(), NULL, ${lines}::text::jsonb
        )
      `;
    } catch (error) {
      purchaseDenied = true;
      expect(String(error)).toContain("PERMISSION_DENIED");
    }
    expect(purchaseDenied).toBe(true);

    const sneaky = (await sql`
      SELECT count(*)::int AS count FROM public.suppliers WHERE name = 'Sneaky'
    `) as unknown as { count: number }[];
    expect(sneaky[0]?.count).toBe(0);
  });

  test("anonymous callers cannot execute the supported purchase and supplier RPCs", async () => {
    let denied = false;
    try {
      await anonSql`SELECT public.supplier_upsert(NULL, 'Anon', NULL, NULL, NULL, true)`;
    } catch (error) {
      denied = true;
      expect(String(error)).toContain("PERMISSION_DENIED");
    }
    expect(denied).toBe(true);

    const [row] = await sql`
      SELECT
        has_function_privilege('anon', 'public.supplier_upsert(uuid,text,text,text,text,boolean)', 'EXECUTE') AS supplier,
        has_function_privilege('anon', 'public.supplier_set_active(uuid,boolean)', 'EXECUTE') AS activate,
        has_function_privilege('anon', 'public.inventory_record_purchase(uuid,uuid,timestamptz,text,jsonb)', 'EXECUTE') AS purchase,
        to_regprocedure('public.purchase_create(uuid,date,text,jsonb)') IS NULL AS legacy_removed
    `;
    expect(Boolean((row as Record<string, unknown>)["supplier"])).toBe(false);
    expect(Boolean((row as Record<string, unknown>)["activate"])).toBe(false);
    expect(Boolean((row as Record<string, unknown>)["purchase"])).toBe(false);
    expect(Boolean((row as Record<string, unknown>)["legacy_removed"])).toBe(true);
  });

  test("inventory_record_purchase is idempotent for the same purchase id", async () => {
    const milk = await itemId("demo_milk");
    const before = (await stockByKey(sql))["demo_milk"] ?? 0;
    const [gen] = await sql`SELECT gen_random_uuid() AS id`;
    const purchaseId = String((gen as { id: string }).id);
    const lines = JSON.stringify([{ inventory_item_id: milk, quantity: 6, unit_cost: 7.5 }]);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const [result] = await sql`
        SELECT public.inventory_record_purchase(${purchaseId}::uuid, NULL, now(), 'retry test',
          ${lines}::text::jsonb) AS id
      `;
      expect(String((result as { id: string }).id)).toBe(purchaseId);
    }

    const movements = await movementsFor(purchaseId);
    expect(movements.length).toBe(1);
    expect(movements[0]?.quantity).toBe(6);

    const [purchaseCount] = await sql`
      SELECT count(*)::int AS count FROM public.purchases WHERE id = ${purchaseId}
    `;
    expect(Number((purchaseCount as { count: number }).count)).toBe(1);

    const items = await sql`
      SELECT count(*)::int AS count FROM public.purchase_lines WHERE purchase_id = ${purchaseId}
    `;
    expect((items as unknown as { count: number }[])[0]?.count).toBe(1);

    const after = (await stockByKey(sql))["demo_milk"] ?? 0;
    expect(round(after - before)).toBe(6);
  });

  test("the server calculates the purchase total from the lines", async () => {
    const tomatoes = await itemId("demo_tomatoes");
    const eggs = await itemId("demo_eggs");
    const [gen] = await sql`SELECT gen_random_uuid() AS id`;
    const purchaseId = String((gen as { id: string }).id);
    const lines = JSON.stringify([
      { inventory_item_id: tomatoes, quantity: 3, unit_cost: 12 },
      { inventory_item_id: eggs, quantity: 10, unit_cost: 1.5 },
    ]);
    await sql`
      SELECT public.inventory_record_purchase(
        ${purchaseId}::uuid, NULL, now(), NULL, ${lines}::text::jsonb
      )
    `;

    const [purchase] = await sql`
      SELECT total_cost::float8 AS total_cost, line_count
        FROM public.purchases WHERE id = ${purchaseId}
    `;
    expect((purchase as { total_cost: number }).total_cost).toBe(51);
    expect(Number((purchase as { line_count: number }).line_count)).toBe(2);
  });

  test("inventory_record_purchase requires a client purchase id", async () => {
    const onions = await itemId("demo_onions");
    const lines = JSON.stringify([{ inventory_item_id: onions, quantity: 1, unit_cost: 2 }]);

    let denied = false;
    try {
      await sql`
        SELECT public.inventory_record_purchase(NULL, NULL, now(), NULL, ${lines}::text::jsonb)
      `;
    } catch (error) {
      denied = true;
      expect(String(error)).toContain("PURCHASE_ID_REQUIRED");
    }
    expect(denied).toBe(true);
  });

  test("inventory_record_purchase rejects an inactive supplier", async () => {
    const onions = await itemId("demo_onions");
    const [supplier] = await sql`
      SELECT public.inventory_upsert_supplier(NULL, 'Inactive supplier', NULL, NULL, NULL, false) AS id
    `;
    const supplierId = String((supplier as { id: string }).id);
    const lines = JSON.stringify([{ inventory_item_id: onions, quantity: 1, unit_cost: 2 }]);

    let denied = false;
    try {
      await sql`
        SELECT public.inventory_record_purchase(
          gen_random_uuid(), ${supplierId}::uuid, now(), NULL, ${lines}::text::jsonb
        )
      `;
    } catch (error) {
      denied = true;
      expect(String(error)).toContain("SUPPLIER_NOT_AVAILABLE");
    }
    expect(denied).toBe(true);
  });

  test("inventory_record_purchase is closed to unauthorised and anonymous callers", async () => {
    const onions = await itemId("demo_onions");
    const lines = JSON.stringify([{ inventory_item_id: onions, quantity: 1, unit_cost: 1 }]);

    let denied = false;
    try {
      await outsiderSql`
        SELECT public.inventory_record_purchase(
          gen_random_uuid(), NULL, now(), NULL, ${lines}::text::jsonb
        )
      `;
    } catch (error) {
      denied = true;
      expect(String(error)).toContain("PERMISSION_DENIED");
    }
    expect(denied).toBe(true);

    const [row] = await sql`
      SELECT has_function_privilege('anon', 'public.inventory_record_purchase(uuid,uuid,timestamptz,text,jsonb)', 'EXECUTE') AS record,
             has_function_privilege('anon', 'public.inventory_upsert_supplier(uuid,text,text,text,text,boolean)', 'EXECUTE') AS supplier
    `;
    expect(Boolean((row as Record<string, unknown>)["record"])).toBe(false);
    expect(Boolean((row as Record<string, unknown>)["supplier"])).toBe(false);
  });
});
