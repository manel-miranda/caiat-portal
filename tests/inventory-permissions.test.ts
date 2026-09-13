import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SQL } from "bun";
import {
  actAs,
  createPreviewOrder,
  createStaffUser,
  createTestDatabase,
  databaseAvailable,
  movementsForOrder,
  type OrderLine,
  type TestDatabase,
} from "./support/preview-db";

const ORDER: OrderLine[] = [
  { dish: "demo_chicken_tajine", quantity: 1 },
];

const canRun = databaseAvailable();
const suite = canRun ? describe : describe.skip;

suite("inventory consumption permissions", () => {
  let db: TestDatabase;
  let sql: SQL;
  let staffId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = db.sql;
    staffId = await createStaffUser(sql, "permission_staff");
    await actAs(sql, staffId);
  });

  afterAll(async () => {
    await db?.drop();
  });

  test("authenticated user without requests_manage cannot call inventory_consume_preview_order directly", async () => {
    const orderId = await createPreviewOrder(sql, ORDER);
    const [outsider] = await sql`
      INSERT INTO auth.users (email) VALUES ('inventory-outsider@example.test') RETURNING id
    `;
    const outsiderId = String((outsider as { id: string }).id);

    const outsiderSql = db.connect();
    await actAs(outsiderSql, outsiderId);

    let denied = false;
    try {
      await outsiderSql`SELECT public.inventory_consume_preview_order(${orderId})`;
    } catch (error) {
      denied = true;
      expect(String(error)).toContain("PERMISSION_DENIED");
    }

    expect(denied).toBe(true);
    expect(await movementsForOrder(sql, orderId)).toEqual([]);

    const [authorized] =
      await sql`SELECT public.inventory_consume_preview_order(${orderId}) AS inserted`;
    expect(Number((authorized as { inserted: number }).inserted)).toBeGreaterThan(0);
  });
});
