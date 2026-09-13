/**
 * Disposable PostgreSQL harness for the inventory-consumption tests.
 *
 * Every run creates a throwaway database, applies the test-only Supabase
 * prelude and then every file in `supabase/migrations` in filename order, so
 * the functions under test are the real production SQL, not a re-implementation.
 * The database is dropped again when the test file finishes. No production or
 * hosted Supabase data is touched: the harness refuses to run against anything
 * but a database URL supplied explicitly through the environment.
 */
import { SQL } from "bun";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const supportDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(supportDir, "..", "..");
const migrationsDir = join(repoRoot, "supabase", "migrations");
const preludePath = join(supportDir, "supabase-prelude.sql");

/** Admin connection string, e.g. `postgres://postgres:postgres@127.0.0.1:5432/postgres`. */
export const adminDatabaseUrl =
  process.env["INVENTORY_TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "";

/** Set in CI so a missing database is a failure rather than a silent skip. */
const testsRequired = process.env["INVENTORY_TESTS_REQUIRED"] === "1";

/**
 * Whether the Postgres-backed tests can run. Without a database URL they are
 * skipped locally (so `bun test` stays usable without Postgres) but fail in CI,
 * where `INVENTORY_TESTS_REQUIRED=1` is set.
 */
export function databaseAvailable(): boolean {
  if (adminDatabaseUrl) return true;
  if (testsRequired) {
    throw new Error(
      "INVENTORY_TESTS_REQUIRED=1 but INVENTORY_TEST_DATABASE_URL / DATABASE_URL is unset.",
    );
  }
  console.warn(
    "[inventory tests] skipped: set INVENTORY_TEST_DATABASE_URL to a PostgreSQL admin connection string to run them.",
  );
  return false;
}

export type TestDatabase = {
  /** Single-connection client, so `set_config` session settings stay put. */
  sql: SQL;
  name: string;
  /** Opens an additional single connection to the same database. */
  connect: () => SQL;
  drop: () => Promise<void>;
};

function urlForDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/** Creates a fresh database and applies prelude + every migration in order. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `caiat_idem_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;

  const admin = new SQL(adminDatabaseUrl, { max: 1 });
  await admin.unsafe(`CREATE DATABASE "${name}"`);
  await admin.end();

  const url = urlForDatabase(adminDatabaseUrl, name);
  const extra: SQL[] = [];
  const sql = new SQL(url, { max: 1 });

  await sql.unsafe(await readFile(preludePath, "utf8"));

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const statements = await readFile(join(migrationsDir, file), "utf8");
    try {
      await sql.unsafe(statements);
    } catch (error) {
      throw new Error(`migration ${file} failed: ${(error as Error).message}`);
    }
  }

  return {
    sql,
    name,
    connect: () => {
      const handle = new SQL(url, { max: 1 });
      extra.push(handle);
      return handle;
    },
    drop: async () => {
      await Promise.all(extra.map((handle) => handle.end()));
      await sql.end();
      const cleanup = new SQL(adminDatabaseUrl, { max: 1 });
      await cleanup.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await cleanup.end();
    },
  };
}

/** Acts as the given user for subsequent statements on this connection. */
export async function actAs(sql: SQL, userId: string): Promise<void> {
  await sql`SELECT set_config('request.jwt.claim.sub', ${userId}, false)`;
}

/** Creates an active staff account that holds `requests_manage` by role default. */
export async function createStaffUser(sql: SQL, username: string): Promise<string> {
  const [user] = await sql`
    INSERT INTO auth.users (email) VALUES (${`${username}@example.test`}) RETURNING id
  `;
  const id = String((user as { id: string }).id);
  await sql`
    INSERT INTO public.profiles (id, username, full_name)
    VALUES (${id}, ${username}, ${`Test ${username}`})
  `;
  await sql`INSERT INTO public.user_roles (user_id, role) VALUES (${id}, 'staff')`;
  return id;
}

export type OrderLine = {
  /** `service_types.key`, e.g. `demo_chicken_tajine`. */
  dish: string;
  quantity: number;
};

/**
 * Creates a preview food order in `requested` state, mirroring what the guest
 * RPC writes (a stay, the order header and one row per dish).
 */
export async function createPreviewOrder(sql: SQL, lines: OrderLine[]): Promise<string> {
  const [room] = await sql`SELECT id FROM public.rooms ORDER BY number LIMIT 1`;
  const [guest] = await sql`
    INSERT INTO public.guests (full_name) VALUES ('Idempotency Tester') RETURNING id
  `;
  const [stay] = await sql`
    INSERT INTO public.stays (guest_id, room_id, check_in, check_out, num_guests, source,
                              accommodation_total, status)
    VALUES (${(guest as { id: string }).id}, ${(room as { id: string }).id},
            CURRENT_DATE, CURRENT_DATE + 1, 1, 'walk_in', 0, 'active')
    RETURNING id
  `;
  const [order] = await sql`
    INSERT INTO public.preview_food_orders (stay_id) VALUES (${(stay as { id: string }).id})
    RETURNING id
  `;
  const orderId = String((order as { id: string }).id);

  for (const line of lines) {
    await sql`
      INSERT INTO public.preview_food_order_items
        (order_id, service_type_id, label, unit_price, quantity, line_total)
      SELECT ${orderId}, st.id, st.label, 0, ${line.quantity}, 0
        FROM public.service_types st
       WHERE st.key = ${line.dish}
    `;
  }
  return orderId;
}

export type Movement = {
  item_key: string;
  movement_type: string;
  quantity: number;
  source_type: string;
  source_id: string | null;
};

/** Consumption/receipt rows written for one order, keyed by inventory item. */
export async function movementsForOrder(sql: SQL, orderId: string): Promise<Movement[]> {
  const rows = await sql`
    SELECT i.key AS item_key, m.movement_type, m.quantity::float8 AS quantity,
           m.source_type, m.source_id
      FROM public.inventory_movements m
      JOIN public.inventory_items i ON i.id = m.inventory_item_id
     WHERE m.source_id = ${orderId}
     ORDER BY i.key
  `;
  return rows as unknown as Movement[];
}

/** Ledger ids for one order, used to prove rows are not rewritten on a replay. */
export async function movementIdsForOrder(sql: SQL, orderId: string): Promise<string[]> {
  const rows = await sql`
    SELECT id FROM public.inventory_movements WHERE source_id = ${orderId} ORDER BY id
  `;
  return (rows as unknown as { id: string }[]).map((r) => String(r.id));
}

/**
 * What the order *should* cost the pantry: one row per distinct ingredient,
 * computed straight from the recipe table rather than from the movements.
 */
export async function expectedConsumption(
  sql: SQL,
  lines: OrderLine[],
): Promise<Record<string, number>> {
  const expected: Record<string, number> = {};
  for (const line of lines) {
    const rows = await sql`
      SELECT i.key AS item_key, rc.qty_per_portion::float8 AS qty_per_portion
        FROM public.inventory_recipe_components rc
        JOIN public.service_types st ON st.id = rc.service_type_id
        JOIN public.inventory_items i ON i.id = rc.inventory_item_id
       WHERE st.key = ${line.dish}
    `;
    for (const row of rows as unknown as { item_key: string; qty_per_portion: number }[]) {
      const key = String(row.item_key);
      expected[key] = (expected[key] ?? 0) + row.qty_per_portion * line.quantity;
    }
  }
  return expected;
}

/** Estimated stock per item key, as the Stock screen reads it. */
export async function stockByKey(sql: SQL): Promise<Record<string, number>> {
  const rows = await sql`
    SELECT key, estimated_stock::float8 AS estimated_stock FROM public.inventory_status
  `;
  const out: Record<string, number> = {};
  for (const row of rows as unknown as { key: string; estimated_stock: number }[]) {
    out[String(row.key)] = row.estimated_stock;
  }
  return out;
}

/** Rounds to the ledger's meaningful precision so float noise cannot flake. */
export function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
