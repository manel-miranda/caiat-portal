import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SQL } from "bun";
import {
  actAs,
  createPreviewOrder,
  createStaffUser,
  createTestDatabase,
  databaseAvailable,
  type TestDatabase,
} from "./support/preview-db";

const canRun = databaseAvailable();
const suite = canRun ? describe : describe.skip;

async function createUserWithRole(
  sql: SQL,
  username: string,
  role: "staff" | "supervisor" | "admin",
): Promise<string> {
  const [user] = await sql`
    INSERT INTO auth.users (email) VALUES (${`${username}@example.test`}) RETURNING id
  `;
  const id = String((user as { id: string }).id);
  await sql`
    INSERT INTO public.profiles (id, username, full_name)
    VALUES (${id}, ${username}, ${`Test ${username}`})
  `;
  await sql`INSERT INTO public.user_roles (user_id, role) VALUES (${id}, ${role}::public.app_role)`;
  return id;
}

async function expectDenied(run: () => Promise<unknown>, marker?: string) {
  let denied = false;
  try {
    await run();
  } catch (error) {
    denied = true;
    if (marker) expect(String(error)).toContain(marker);
  }
  expect(denied).toBe(true);
}

suite("independent security review hardening", () => {
  let db: TestDatabase;
  let sql: SQL;
  let staffId: string;
  let supervisorId: string;
  let roomId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = db.sql;
    staffId = await createStaffUser(sql, "review_staff");
    supervisorId = await createUserWithRole(sql, "review_supervisor", "supervisor");
    const [room] = await sql`SELECT id FROM public.rooms ORDER BY number LIMIT 1`;
    roomId = String((room as { id: string }).id);
  });

  afterAll(async () => {
    await db?.drop();
  });

  test("authenticated users cannot mutate their own profile fields", async () => {
    const userSql = db.connect();
    await userSql.unsafe("SET ROLE authenticated");
    await actAs(userSql, staffId);

    await expectDenied(
      () => userSql`UPDATE public.profiles SET active = false WHERE id = ${staffId}`,
      "permission denied",
    );
    await expectDenied(
      () => userSql`UPDATE public.profiles SET username = 'self-renamed' WHERE id = ${staffId}`,
      "permission denied",
    );

    const [profile] = await sql`
      SELECT active, username FROM public.profiles WHERE id = ${staffId}
    `;
    expect((profile as { active: boolean }).active).toBe(true);
    expect(String((profile as { username: string }).username)).toBe("review_staff");
  });

  test("cash reconciliation calculates expected cash on the server and blocks direct rewrites", async () => {
    await actAs(sql, supervisorId);
    const [created] = await sql`
      SELECT public.create_stay_with_guest(
        'Cash Review', ${roomId}, DATE '2040-01-14', DATE '2040-01-16',
        1, 'walk_in'::public.stay_source, 0, NULL, 'confirmed', NULL, NULL, NULL
      ) AS id
    `;
    const stayId = String((created as { id: string }).id);

    await sql`
      INSERT INTO public.payments(stay_id, amount, method, received_by, created_at)
      VALUES (${stayId}, 100, 'cash', ${supervisorId}, TIMESTAMPTZ '2040-01-15 10:00:00+00')
    `;

    const supervisorSql = db.connect();
    await supervisorSql.unsafe("SET ROLE authenticated");
    await actAs(supervisorSql, supervisorId);
    const [row] = await supervisorSql`
      SELECT (public.cash_reconcile(DATE '2040-01-15', 80, 'counted')).*
    `;
    expect(Number((row as { expected_total: number }).expected_total)).toBe(100);
    expect(Number((row as { counted_total: number }).counted_total)).toBe(80);
    expect(Number((row as { difference: number }).difference)).toBe(-20);

    await expectDenied(
      () => supervisorSql`
        UPDATE public.cash_reconciliations
           SET expected_total = 80
         WHERE business_date = DATE '2040-01-15'
      `,
      "permission denied",
    );
  });

  test("food-order status cannot bypass the status RPC through direct table writes", async () => {
    const orderId = await createPreviewOrder(sql, [{ dish: "demo_kefta_tajine", quantity: 1 }]);
    const staffSql = db.connect();
    await staffSql.unsafe("SET ROLE authenticated");
    await actAs(staffSql, staffId);

    await expectDenied(
      () => staffSql`UPDATE public.preview_food_orders SET status = 'delivered' WHERE id = ${orderId}`,
      "permission denied",
    );
    await expectDenied(
      () => staffSql`DELETE FROM public.preview_food_orders WHERE id = ${orderId}`,
      "permission denied",
    );

    await staffSql`SELECT public.preview_food_order_set_status(${orderId}, 'accepted')`;
    const [row] = await sql`SELECT status FROM public.preview_food_orders WHERE id = ${orderId}`;
    expect(String((row as { status: string }).status)).toBe("accepted");
  });

  test("guest food RPC rejects hidden and non-food catalogue services", async () => {
    await actAs(sql, supervisorId);
    const [created] = await sql`
      SELECT public.create_stay_with_guest(
        'Guest Order Scope', ${roomId}, DATE '2040-02-01', DATE '2040-02-03',
        1, 'walk_in'::public.stay_source, 0, NULL, 'confirmed', NULL, NULL, NULL
      ) AS id
    `;
    const stayId = String((created as { id: string }).id);
    const [tokenRow] = await sql`SELECT public.guest_token_generate(${stayId}) AS token`;
    const token = String((tokenRow as { token: string }).token);

    const [nonFood] = await sql`
      INSERT INTO public.service_types(
        key, label, default_price, billable, requestable, active, guest_visible,
        guest_category, guest_subcategory, preview_only, available_today
      ) VALUES (
        'review_activity', 'Review Activity', 50, true, true, true, true,
        'activity', NULL, false, true
      ) RETURNING id
    `;
    const [hiddenFood] = await sql`
      INSERT INTO public.service_types(
        key, label, default_price, billable, requestable, active, guest_visible,
        guest_category, guest_subcategory, preview_only, available_today
      ) VALUES (
        'review_hidden_food', 'Hidden Food', 20, true, true, true, false,
        'food', 'mains', false, true
      ) RETURNING id
    `;
    const [validFood] = await sql`
      INSERT INTO public.service_types(
        key, label, default_price, billable, requestable, active, guest_visible,
        guest_category, guest_subcategory, preview_only, available_today
      ) VALUES (
        'review_valid_food', 'Valid Food', 30, true, true, true, true,
        'food', 'mains', false, true
      ) RETURNING id
    `;

    const anonSql = db.connect();
    await anonSql.unsafe("SET ROLE anon");

    const nonFoodLines = JSON.stringify([
      { service_type_id: String((nonFood as { id: string }).id), quantity: 1 },
    ]);
    await expectDenied(
      () => anonSql`
        SELECT public.guest_create_preview_food_order(
          ${token}, ${nonFoodLines}::text::jsonb, NULL, 'asap'
        )
      `,
      "INVALID_ITEM",
    );

    const hiddenLines = JSON.stringify([
      { service_type_id: String((hiddenFood as { id: string }).id), quantity: 1 },
    ]);
    await expectDenied(
      () => anonSql`
        SELECT public.guest_create_preview_food_order(
          ${token}, ${hiddenLines}::text::jsonb, NULL, 'asap'
        )
      `,
      "INVALID_ITEM",
    );

    const validLines = JSON.stringify([
      { service_type_id: String((validFood as { id: string }).id), quantity: 1 },
    ]);
    const [validOrder] = await anonSql`
      SELECT public.guest_create_preview_food_order(
        ${token}, ${validLines}::text::jsonb, NULL, 'asap'
      ) AS id
    `;
    expect(String((validOrder as { id: string }).id).length).toBeGreaterThan(20);
  });

  test("charges and payments cannot be added after checkout", async () => {
    await actAs(sql, supervisorId);
    const [created] = await sql`
      SELECT public.create_stay_with_guest(
        'Closed Finance', ${roomId}, DATE '2040-03-01', DATE '2040-03-02',
        1, 'walk_in'::public.stay_source, 0, NULL, 'confirmed', NULL, NULL, NULL
      ) AS id
    `;
    const stayId = String((created as { id: string }).id);
    await sql`SELECT public.checkout_stay(${stayId}, false)`;

    const staffSql = db.connect();
    await staffSql.unsafe("SET ROLE authenticated");
    await actAs(staffSql, staffId);

    await expectDenied(
      () => staffSql`
        INSERT INTO public.charges(stay_id, label, quantity, unit_price, created_by)
        VALUES (${stayId}, 'Late charge', 1, 10, ${staffId})
      `,
      "row-level security",
    );
    await expectDenied(
      () => staffSql`
        INSERT INTO public.payments(stay_id, amount, method, received_by)
        VALUES (${stayId}, 10, 'cash', ${staffId})
      `,
      "row-level security",
    );
  });

  test("request completion billing is server-side and idempotent", async () => {
    await actAs(sql, supervisorId);
    const [created] = await sql`
      SELECT public.create_stay_with_guest(
        'Request Billing', ${roomId}, DATE '2040-04-01', DATE '2040-04-02',
        1, 'walk_in'::public.stay_source, 0, NULL, 'confirmed', NULL, NULL, NULL
      ) AS id
    `;
    const stayId = String((created as { id: string }).id);
    const [service] = await sql`
      INSERT INTO public.service_types(key, label, default_price, billable, requestable, active)
      VALUES ('review_billable', 'Review Billable', 42, true, true, true)
      RETURNING id
    `;
    const serviceId = String((service as { id: string }).id);
    const [request] = await sql`
      INSERT INTO public.requests(stay_id, room_id, service_type_id, label, status)
      VALUES (${stayId}, ${roomId}, ${serviceId}, 'Review Billable', 'pending')
      RETURNING id
    `;
    const requestId = String((request as { id: string }).id);

    const staffSql = db.connect();
    await staffSql.unsafe("SET ROLE authenticated");
    await actAs(staffSql, staffId);

    await staffSql`SELECT public.complete_request(${requestId}, true)`;
    await staffSql`SELECT public.complete_request(${requestId}, true)`;

    const [charge] = await sql`
      SELECT count(*)::int AS n, coalesce(sum(total), 0)::float8 AS total
        FROM public.charges
       WHERE source_request_id = ${requestId}
    `;
    expect(Number((charge as { n: number }).n)).toBe(1);
    expect(Number((charge as { total: number }).total)).toBe(42);

    const [requestState] = await sql`SELECT status FROM public.requests WHERE id = ${requestId}`;
    expect(String((requestState as { status: string }).status)).toBe("completed");

    await expectDenied(
      () => staffSql`UPDATE public.requests SET status = 'pending' WHERE id = ${requestId}`,
      "permission denied",
    );
  });

  test("legacy purchase_create RPC is removed", async () => {
    const [row] = await sql`
      SELECT to_regprocedure('public.purchase_create(uuid,date,text,jsonb)') IS NULL AS removed
    `;
    expect((row as { removed: boolean }).removed).toBe(true);
  });
});
