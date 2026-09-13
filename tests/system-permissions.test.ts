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

async function expectDenied(run: () => Promise<unknown>, marker = "PERMISSION_DENIED") {
  let denied = false;
  try {
    await run();
  } catch (error) {
    denied = true;
    expect(String(error)).toContain(marker);
  }
  expect(denied).toBe(true);
}

suite("system permission boundaries", () => {
  let db: TestDatabase;
  let sql: SQL;
  let staffId: string;
  let supervisorId: string;
  let outsiderId: string;
  let roomId: string;
  let serviceId: string;
  let inventoryItemId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = db.sql;
    staffId = await createStaffUser(sql, "permission_staff_system");
    supervisorId = await createUserWithRole(sql, "permission_supervisor", "supervisor");

    const [outsider] = await sql`
      INSERT INTO auth.users (email) VALUES ('system-outsider@example.test') RETURNING id
    `;
    outsiderId = String((outsider as { id: string }).id);

    const [room] = await sql`SELECT id FROM public.rooms ORDER BY number LIMIT 1`;
    roomId = String((room as { id: string }).id);
    const [service] = await sql`SELECT id FROM public.service_types ORDER BY key LIMIT 1`;
    serviceId = String((service as { id: string }).id);
    const [item] = await sql`SELECT id FROM public.inventory_items ORDER BY key LIMIT 1`;
    inventoryItemId = String((item as { id: string }).id);
  });

  afterAll(async () => {
    await db?.drop();
  });

  test("staff defaults do not include reservation, customer, guest-token, cash or admin permissions", async () => {
    await actAs(sql, staffId);
    const [row] = await sql`
      SELECT
        public.has_permission(${staffId}, 'reservations_manage') AS reservations,
        public.has_permission(${staffId}, 'customers_manage') AS customers,
        public.has_permission(${staffId}, 'guest_access_manage') AS guest_access,
        public.has_permission(${staffId}, 'cash_reconcile') AS cash,
        public.has_permission(${staffId}, 'users_manage') AS users_manage,
        public.has_permission(${staffId}, 'payments_manage') AS payments,
        public.has_permission(${staffId}, 'requests_manage') AS requests
    `;
    const p = row as Record<string, boolean>;
    expect(p.reservations).toBe(false);
    expect(p.customers).toBe(false);
    expect(p.guest_access).toBe(false);
    expect(p.cash).toBe(false);
    expect(p.users_manage).toBe(false);
    expect(p.payments).toBe(true);
    expect(p.requests).toBe(true);
  });

  test("staff cannot create stays through the SECURITY DEFINER RPC", async () => {
    await actAs(sql, staffId);
    await expectDenied(
      () => sql`
        SELECT public.create_stay_with_guest(
          'Unauthorized Guest', ${roomId}, DATE '2040-01-01', DATE '2040-01-02',
          1, 'walk_in'::public.stay_source, 0, NULL, 'confirmed', NULL, NULL, NULL
        )
      `,
      "PERMISSION_DENIED:reservations_manage",
    );

    const [count] = await sql`
      SELECT count(*)::int AS n FROM public.guests WHERE full_name = 'Unauthorized Guest'
    `;
    expect(Number((count as { n: number }).n)).toBe(0);
  });

  test("reservation edit, confirm and reject remain protected from ordinary staff", async () => {
    await actAs(sql, supervisorId);
    const [created] = await sql`
      SELECT public.create_stay_with_guest(
        'Pending Reservation', ${roomId}, DATE '2040-02-01', DATE '2040-02-02',
        1, 'walk_in'::public.stay_source, 0, NULL, 'pending', NULL, NULL, NULL
      ) AS id
    `;
    const stayId = String((created as { id: string }).id);

    await actAs(sql, staffId);
    await expectDenied(
      () => sql`SELECT public.confirm_reservation(${stayId})`,
      "PERMISSION_DENIED:reservations_manage",
    );
    await expectDenied(
      () => sql`SELECT public.reject_reservation(${stayId})`,
      "PERMISSION_DENIED:reservations_manage",
    );
    await expectDenied(
      () => sql`
        SELECT public.edit_stay(
          ${stayId}, 'Pending Reservation', ${roomId}, DATE '2040-02-01', DATE '2040-02-03',
          1, 'walk_in'::public.stay_source, 0, NULL
        )
      `,
      "PERMISSION_DENIED:reservations_manage",
    );
  });

  test("checkout requires reservations_manage even when balance is zero", async () => {
    await actAs(sql, supervisorId);
    const [created] = await sql`
      SELECT public.create_stay_with_guest(
        'Checkout Permission', ${roomId}, DATE '2040-03-01', DATE '2040-03-02',
        1, 'walk_in'::public.stay_source, 0, NULL, 'confirmed', NULL, NULL, NULL
      ) AS id
    `;
    const stayId = String((created as { id: string }).id);

    await actAs(sql, staffId);
    await expectDenied(
      () => sql`SELECT public.checkout_stay(${stayId}, false)`,
      "PERMISSION_DENIED:reservations_manage",
    );

    const [stillActive] = await sql`SELECT status::text AS status FROM public.stays WHERE id = ${stayId}`;
    expect(String((stillActive as { status: string }).status)).toBe("active");

    await actAs(sql, supervisorId);
    const [result] = await sql`SELECT public.checkout_stay(${stayId}, false) AS outstanding`;
    expect(Number((result as { outstanding: number }).outstanding)).toBe(0);
  });

  test("checkout_override is still an additional permission for an outstanding balance", async () => {
    const reservationOnlyId = await createUserWithRole(sql, "reservation_only", "staff");
    await sql`
      INSERT INTO public.user_permissions(user_id, permission, granted)
      VALUES (${reservationOnlyId}, 'reservations_manage', true)
    `;

    await actAs(sql, supervisorId);
    const [created] = await sql`
      SELECT public.create_stay_with_guest(
        'Outstanding Balance', ${roomId}, DATE '2040-04-01', DATE '2040-04-02',
        1, 'walk_in'::public.stay_source, 100, NULL, 'confirmed', NULL, NULL, NULL
      ) AS id
    `;
    const stayId = String((created as { id: string }).id);

    await actAs(sql, reservationOnlyId);
    await expectDenied(
      () => sql`SELECT public.checkout_stay(${stayId}, true)`,
      "OUTSTANDING_BALANCE",
    );
  });

  test("customer and guest-access RPCs reject staff without their permissions", async () => {
    await actAs(sql, supervisorId);
    const [guest] = await sql`
      INSERT INTO public.guests(full_name) VALUES ('Protected Customer') RETURNING id
    `;
    const guestId = String((guest as { id: string }).id);
    const [stay] = await sql`
      SELECT public.create_stay_with_guest(
        'Token Guest', ${roomId}, DATE '2040-05-01', DATE '2040-05-02',
        1, 'walk_in'::public.stay_source, 0, NULL, 'confirmed', NULL, NULL, NULL
      ) AS id
    `;
    const stayId = String((stay as { id: string }).id);

    await actAs(sql, staffId);
    await expectDenied(() => sql`SELECT public.customer_upsert('Nope', NULL, NULL, NULL, NULL)`);
    await expectDenied(
      () => sql`SELECT public.customer_update_profile(${guestId}, 'Changed', NULL, NULL, NULL, NULL)`,
      "PERMISSION_DENIED:customers_manage",
    );
    await expectDenied(() => sql`SELECT public.merge_customers(${guestId}, ${guestId})`);
    await expectDenied(
      () => sql`SELECT public.guest_token_generate(${stayId})`,
      "PERMISSION_DENIED:guest_access_manage",
    );
    await expectDenied(
      () => sql`SELECT public.guest_token_revoke(${stayId})`,
      "PERMISSION_DENIED:guest_access_manage",
    );
  });

  test("admin-only catalogue, inventory-configuration and user-management RPCs reject supervisors", async () => {
    await actAs(sql, supervisorId);

    await expectDenied(
      () => sql`
        SELECT public.catalog_upsert_service(
          NULL, 'unauthorized_service', 'Unauthorized', 0, true, false, false, false,
          'other', NULL, NULL, NULL, NULL, NULL, 0, 0, false, false, '{}'::jsonb, '{}'::jsonb
        )
      `,
      "PERMISSION_DENIED",
    );
    await expectDenied(() => sql`SELECT public.catalog_set_active(${serviceId}, false)`, "PERMISSION_DENIED");
    await expectDenied(() => sql`SELECT public.catalog_set_available(${serviceId}, false)`, "PERMISSION_DENIED");
    await expectDenied(
      () => sql`SELECT public.inventory_upsert_item(NULL, 'blocked_item', 'Blocked', 'kg', 0, 4, true, false, NULL)`,
    );
    await expectDenied(() => sql`SELECT public.inventory_set_recipe(${serviceId}, '[]'::jsonb)`);
    await expectDenied(() => sql`SELECT public.set_user_role(${staffId}, 'supervisor'::public.app_role)`, "ADMIN_REQUIRED");
    await expectDenied(() => sql`SELECT public.set_user_active(${staffId}, false)`, "ADMIN_REQUIRED");
    await expectDenied(() => sql`SELECT public.set_user_permission(${staffId}, 'cash_reconcile', true)`, "PERMISSION_DENIED");
  });

  test("an authenticated account with no app permissions cannot mutate inventory or food-order state", async () => {
    const outsiderSql = db.connect();
    await actAs(outsiderSql, outsiderId);

    await expectDenied(() => outsiderSql`SELECT public.inventory_receive(${inventoryItemId}, 1, NULL, NULL)`);
    await expectDenied(() => outsiderSql`SELECT public.inventory_adjust(${inventoryItemId}, 1, NULL)`);
    await expectDenied(() => outsiderSql`SELECT public.inventory_waste(${inventoryItemId}, 1, NULL)`);
  });

  test("RLS blocks unauthorized financial writes while preserving staff payment access", async () => {
    await actAs(sql, supervisorId);
    const [created] = await sql`
      SELECT public.create_stay_with_guest(
        'Finance RLS', ${roomId}, DATE '2040-06-01', DATE '2040-06-02',
        1, 'walk_in'::public.stay_source, 0, NULL, 'confirmed', NULL, NULL, NULL
      ) AS id
    `;
    const stayId = String((created as { id: string }).id);

    const outsiderSql = db.connect();
    await outsiderSql.unsafe("SET ROLE authenticated");
    await actAs(outsiderSql, outsiderId);

    await expectDenied(
      () => outsiderSql`
        INSERT INTO public.payments(stay_id, amount, method, received_by)
        VALUES (${stayId}, 10, 'cash', ${outsiderId})
      `,
      "row-level security",
    );
    await expectDenied(
      () => outsiderSql`
        INSERT INTO public.charges(stay_id, label, quantity, unit_price, total, created_by)
        VALUES (${stayId}, 'Unauthorized charge', 1, 10, 10, ${outsiderId})
      `,
      "row-level security",
    );
    await expectDenied(
      () => outsiderSql`
        INSERT INTO public.cash_reconciliations(business_date, expected_total, counted_total, difference, closed_by)
        VALUES (DATE '2040-06-01', 10, 10, 0, ${outsiderId})
      `,
      "row-level security",
    );

    const staffSql = db.connect();
    await staffSql.unsafe("SET ROLE authenticated");
    await actAs(staffSql, staffId);
    await staffSql`
      INSERT INTO public.payments(stay_id, amount, method, received_by)
      VALUES (${stayId}, 10, 'cash', ${staffId})
    `;
    const [paymentCount] = await sql`
      SELECT count(*)::int AS n FROM public.payments WHERE stay_id = ${stayId}
    `;
    expect(Number((paymentCount as { n: number }).n)).toBe(1);
  });

  test("sensitive staff RPCs are not executable by anon", async () => {
    const [row] = await sql`
      SELECT
        has_function_privilege('anon', 'public.create_stay_with_guest(text,uuid,date,date,integer,public.stay_source,numeric,text,text,uuid,text,text)', 'EXECUTE') AS create_stay,
        has_function_privilege('anon', 'public.checkout_stay(uuid,boolean)', 'EXECUTE') AS checkout,
        has_function_privilege('anon', 'public.catalog_set_active(uuid,boolean)', 'EXECUTE') AS catalogue,
        has_function_privilege('anon', 'public.inventory_receive(uuid,numeric,numeric,text)', 'EXECUTE') AS inventory,
        has_function_privilege('anon', 'public.set_user_role(uuid,public.app_role)', 'EXECUTE') AS roles
    `;
    const privileges = row as Record<string, boolean>;
    expect(privileges.create_stay).toBe(false);
    expect(privileges.checkout).toBe(false);
    expect(privileges.catalogue).toBe(false);
    expect(privileges.inventory).toBe(false);
    expect(privileges.roles).toBe(false);
  });
});
