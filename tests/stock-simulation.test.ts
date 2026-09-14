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
    const [row] =
      await sql`SELECT public.inventory_simulate_week(${runId}, 'busy') AS summary`;
    const summary = (row as { summary: { meals: number; items: unknown[] } }).summary;
    expect(summary.meals).toBeGreaterThan(0);
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
      expect(m.quantity).toBeLessThan(0);
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
});
