import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  createTestDatabase,
  databaseAvailable,
  stockByKey,
  type TestDatabase,
} from "./support/preview-db";

const run = databaseAvailable() ? describe : describe.skip;
run("fictional finance history", () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await createTestDatabase();
  });
  afterAll(async () => {
    await db?.drop();
  });

  test("fills missing costs with varied history without changing stock or existing prices", async () => {
    const stock = await stockByKey(db.sql);
    await db.sql`INSERT INTO public.purchases(id, notes) VALUES ('00000000-0000-4000-8000-000000000123', 'Existing price fixture')`;
    await db.sql`INSERT INTO public.purchase_lines(purchase_id, inventory_item_id, quantity, unit_cost, line_total)
      SELECT '00000000-0000-4000-8000-000000000123', id, 1, 99, 99 FROM public.inventory_items WHERE key = 'demo_bread'`;
    await db.sql`SELECT finance_sample_private.seed_history()`;
    const [row] =
      (await db.sql`SELECT count(*)::int AS n, count(DISTINCT pl.unit_cost)::int AS prices
      FROM public.purchase_lines pl JOIN public.purchases p ON p.id=pl.purchase_id
      JOIN public.inventory_items i ON i.id=pl.inventory_item_id
      WHERE i.key='demo_chicken' AND p.notes LIKE '[FICTIONAL FINANCE V1]%'`) as {
        n: number;
        prices: number;
      }[];
    expect(row?.n).toBe(6);
    expect(row?.prices).toBe(6);
    const [bread] =
      (await db.sql`SELECT last_unit_cost::float8 AS cost FROM public.inventory_purchase_context c
      JOIN public.inventory_items i ON i.id=c.inventory_item_id WHERE i.key='demo_bread'`) as {
        cost: number;
      }[];
    expect(bread?.cost).toBe(99);
    expect(await stockByKey(db.sql)).toEqual(stock);
  });

  test("replays without duplicate records", async () => {
    const before = await db.sql`SELECT id, total_cost FROM public.purchases ORDER BY id`;
    await db.sql`SELECT finance_sample_private.seed_history()`;
    expect(await db.sql`SELECT id, total_cost FROM public.purchases ORDER BY id`).toEqual(before);
  });

  test("guarded import script preserves records and validates a replay", async () => {
    const script = await readFile(new URL("../scripts/finance/seed.sql", import.meta.url), "utf8");
    await db.sql.unsafe(script);
    const [invalid] = (await db.sql`SELECT count(*)::int AS n FROM public.purchases p
      WHERE p.notes LIKE '[FICTIONAL FINANCE V1]%' AND
      (p.total_cost <> (SELECT sum(line_total) FROM public.purchase_lines WHERE purchase_id=p.id)
      OR p.line_count <> (SELECT count(*) FROM public.purchase_lines WHERE purchase_id=p.id))`) as {
      n: number;
    }[];
    expect(invalid?.n).toBe(0);
  });

  test("is not callable by app users", async () => {
    const client = db.connect();
    await client.unsafe("SET ROLE authenticated");
    await expect(
      Promise.resolve(client`SELECT finance_sample_private.seed_history()`),
    ).rejects.toThrow("permission denied");
  });
});
