import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SQL } from "bun";
import {
  actAs,
  createStaffUser,
  createTestDatabase,
  databaseAvailable,
  type TestDatabase,
} from "./support/preview-db";

const canRun = databaseAvailable();
const suite = canRun ? describe : describe.skip;

suite("stock simulation", () => {
  let db: TestDatabase;
  let sql: SQL;
  let adminId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = db.sql;
    adminId = await createStaffUser(sql, "simulation_admin");
    await sql`UPDATE public.user_roles SET role = 'admin' WHERE user_id = ${adminId}`;
    await actAs(sql, adminId);
  });

  afterAll(async () => {
    await db?.drop();
  });

  test("a simulated week consumes ingredients through the normal ledger", async () => {
    const runId = crypto.randomUUID();
    const [row] = await sql`SELECT public.inventory_simulate_week(${runId}, 'busy') AS summary`;
    const summary = (row as { summary: { meals: number; items: unknown[] } }).summary;
    expect(summary.meals > 0).toBe(true);
    expect(summary.items.length).toBeGreaterThan(0);

    const moves = await sql`
      SELECT quantity::float8 AS quantity, movement_type, source_type
        FROM public.inventory_movements WHERE source_id = ${runId}
    `;
    const list = moves as unknown as {
      quantity: number;
      movement_type: string;
      source_type: string;
    }[];
    expect(list.length).toBeGreaterThan(0);
    for (const m of list) {
      expect(m.movement_type).toBe("consumption");
      expect(m.source_type).toBe("simulation");
      expect(m.quantity < 0).toBe(true);
    }
  });

  test("re-running the same run id is a no-op", async () => {
    const runId = crypto.randomUUID();
    await sql`SELECT public.inventory_simulate_week(${runId}, 'normal')`;
    const [before] =
      await sql`SELECT count(*)::int AS n FROM public.inventory_movements WHERE source_id = ${runId}`;
    await sql`SELECT public.inventory_simulate_week(${runId}, 'normal')`;
    const [after] =
      await sql`SELECT count(*)::int AS n FROM public.inventory_movements WHERE source_id = ${runId}`;
    expect((after as { n: number }).n).toBe((before as { n: number }).n);
  });

  test("non-admin users cannot simulate or reset", async () => {
    const staffId = await createStaffUser(sql, "simulation_staff");
    const staffSql = db.connect();
    await actAs(staffSql, staffId);

    for (const statement of [
      staffSql`SELECT public.inventory_simulate_week(${crypto.randomUUID()}, 'quiet')`,
      staffSql`SELECT public.inventory_simulate_purchase(${crypto.randomUUID()})`,
      staffSql`SELECT public.inventory_simulation_reset()`,
    ]) {
      let denied = false;
      try {
        await statement;
      } catch (error) {
        denied = true;
        expect(String(error)).toContain("PERMISSION_DENIED");
      }
      expect(denied).toBe(true);
    }
  });

  test("reset removes simulated activity and leaves real movements alone", async () => {
    const [item] = await sql`SELECT id FROM public.inventory_items WHERE active LIMIT 1`;
    const itemId = String((item as { id: string }).id);
    await sql`SELECT public.inventory_receive(${itemId}, 5, NULL, 'real receipt')`;

    await sql`SELECT public.inventory_simulate_week(${crypto.randomUUID()}, 'stress')`;
    await sql`SELECT public.inventory_simulate_purchase(${crypto.randomUUID()})`;

    const [result] = await sql`SELECT public.inventory_simulation_reset() AS r`;
    expect(Number((result as { r: { movements: number } }).r.movements)).toBeGreaterThan(0);

    const [leftover] = await sql`
      SELECT count(*)::int AS n FROM public.inventory_movements WHERE source_type = 'simulation'
    `;
    expect((leftover as { n: number }).n).toBe(0);

    const [sims] =
      await sql`SELECT count(*)::int AS n FROM public.purchases WHERE notes LIKE '[SIM]%'`;
    expect((sims as { n: number }).n).toBe(0);

    const [real] = await sql`
      SELECT count(*)::int AS n FROM public.inventory_movements WHERE notes = 'real receipt'
    `;
    expect((real as { n: number }).n).toBe(1);
  });

  test("seeded demo history creates backdated usage and purchases, and reset clears them", async () => {
    // a manual supplier and purchase must survive the reset
    const [supplierRow] =
      await sql`SELECT public.supplier_upsert(NULL, 'Manual Supplier', NULL, NULL, NULL, true) AS id`;
    const supplierId = String((supplierRow as { id: string }).id);
    const [manualItem] = await sql`SELECT id FROM public.inventory_items WHERE active LIMIT 1`;
    const manualPurchase = crypto.randomUUID();
    await sql`
      SELECT public.inventory_record_purchase(
        ${manualPurchase}, ${supplierId}, now(), 'manual purchase',
        ${JSON.stringify([
          {
            inventory_item_id: String((manualItem as { id: string }).id),
            quantity: 2,
            unit_cost: 10,
          },
        ])}::jsonb)
    `;

    const [historyRow] =
      await sql`SELECT public.inventory_simulate_history(${crypto.randomUUID()}, 30) AS s`;
    const summary = (historyRow as { s: { days: number; meals: number; purchases: number } }).s;
    expect(summary.days).toBe(30);
    expect(summary.meals > 0).toBe(true);
    expect(summary.purchases > 0).toBe(true);

    const [hist] = await sql`
      SELECT count(*)::int AS n FROM public.inventory_movements
       WHERE source_type = 'simulation_history'
    `;
    expect((hist as { n: number }).n > 0).toBe(true);

    const [old] = await sql`
      SELECT count(*)::int AS n FROM public.inventory_movements
       WHERE source_type = 'simulation_history' AND created_at < now() - interval '7 days'
    `;
    expect((old as { n: number }).n > 0).toBe(true);

    const [demoSuppliers] =
      await sql`SELECT count(*)::int AS n FROM public.suppliers WHERE name LIKE '[DEMO]%'`;
    expect((demoSuppliers as { n: number }).n).toBe(4);

    // reset must not raise "DELETE requires a WHERE clause" and must clear sim data
    await sql`SELECT public.inventory_simulation_reset()`;

    const [leftHist] = await sql`
      SELECT count(*)::int AS n FROM public.inventory_movements
       WHERE source_type IN ('simulation', 'simulation_history')
    `;
    expect((leftHist as { n: number }).n).toBe(0);

    const [leftSimPurchases] =
      await sql`SELECT count(*)::int AS n FROM public.purchases WHERE notes LIKE '[SIM]%'`;
    expect((leftSimPurchases as { n: number }).n).toBe(0);

    const [runs] = await sql`SELECT count(*)::int AS n FROM public.inventory_simulation_runs`;
    expect((runs as { n: number }).n).toBe(0);

    const [manual] =
      await sql`SELECT count(*)::int AS n FROM public.purchases WHERE id = ${manualPurchase}`;
    expect((manual as { n: number }).n).toBe(1);

    const [manualSupplier] =
      await sql`SELECT count(*)::int AS n FROM public.suppliers WHERE id = ${supplierId}`;
    expect((manualSupplier as { n: number }).n).toBe(1);
  });

  test("non-admin users cannot seed demo history", async () => {
    const staffId = await createStaffUser(sql, "history_staff");
    const staffSql = db.connect();
    await actAs(staffSql, staffId);
    let denied = false;
    try {
      await staffSql`SELECT public.inventory_simulate_history(${crypto.randomUUID()}, 30)`;
    } catch (error) {
      denied = true;
      expect(String(error)).toContain("PERMISSION_DENIED");
    }
    expect(denied).toBe(true);
  });
});
