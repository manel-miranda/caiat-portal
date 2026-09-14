/** Restaurant checkout boundaries, exercised against disposable migrated PostgreSQL. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SQL } from "bun";
import {
  actAs,
  createStaffUser,
  createTestDatabase,
  databaseAvailable,
  type TestDatabase,
} from "./support/preview-db";

const suite = databaseAvailable() ? describe : describe.skip;
const origins = ["guest", "staff"] as const;
const openStatuses = ["requested", "accepted", "preparing", "ready"] as const;
type Origin = (typeof origins)[number];
type Stay = { id: string; token: string };
type Outcome<T> = { value: T } | { error: unknown };

function observe<T>(operation: Promise<T>) {
  let settled = false;
  const result: Promise<Outcome<T>> = operation.then(
    (value) => {
      settled = true;
      return { value };
    },
    (error: unknown) => {
      settled = true;
      return { error };
    },
  );
  return { result, isSettled: () => settled };
}

async function expectFailure(operation: Promise<unknown>, marker: string) {
  const result = await observe(operation).result;
  expect("error" in result).toBe(true);
  if ("error" in result) expect(String(result.error)).toContain(marker);
}

async function backendPid(connection: SQL): Promise<number> {
  const [row] = await connection`SELECT pg_backend_pid() AS pid`;
  return Number((row as { pid: number }).pid);
}

/** Release the first transaction only after PostgreSQL proves the other RPC is waiting on it. */
async function waitForBlocking(
  observer: SQL,
  waitingPid: number,
  blockingPid: number,
  isSettled: () => boolean,
) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const [row] = await observer`
      SELECT state = 'active' AND wait_event_type = 'Lock'
             AND ${blockingPid}::integer = ANY (pg_blocking_pids(pid)) AS blocked
        FROM pg_stat_activity WHERE pid = ${waitingPid}
    `;
    if ((row as { blocked: boolean } | undefined)?.blocked) return;
    if (isSettled())
      throw new Error("The competing RPC finished without waiting for the stay lock");
  }
  throw new Error("PostgreSQL did not report the expected stay-lock dependency");
}

suite("restaurant orders and checkout", () => {
  let db: TestDatabase;
  let sql: SQL;
  let staff: SQL;
  let guest: SQL;
  let staffId: string;
  let dishId: string;

  async function connectionFor(origin: Origin): Promise<SQL> {
    const connection = db.connect();
    await connection.unsafe("SET statement_timeout = '6s'");
    await connection`
      SELECT set_config('request.jwt.claim.role', ${origin === "staff" ? "authenticated" : "anon"}, false)
    `;
    if (origin === "staff") {
      await actAs(connection, staffId);
      await connection.unsafe("SET ROLE authenticated");
    } else {
      await connection.unsafe("SET ROLE anon");
    }
    return connection;
  }

  async function createStay(name: string, accommodationTotal = 0): Promise<Stay> {
    const [room] = await sql`SELECT id FROM public.rooms ORDER BY number LIMIT 1`;
    const [person] = await sql`INSERT INTO public.guests(full_name) VALUES (${name}) RETURNING id`;
    const [row] = await sql`
      INSERT INTO public.stays(guest_id, room_id, check_in, check_out, num_guests, source,
                               accommodation_total, status, confirmation_status)
      VALUES (${(person as { id: string }).id}, ${(room as { id: string }).id},
              CURRENT_DATE, CURRENT_DATE + 1, 1, 'walk_in', ${accommodationTotal}, 'active', 'confirmed')
      RETURNING id
    `;
    const id = String((row as { id: string }).id);
    const [access] = await staff`SELECT public.guest_token_generate(${id}) AS token`;
    return { id, token: String((access as { token: string }).token) };
  }

  async function createOrder(connection: SQL, origin: Origin, stay: Stay): Promise<string> {
    const [row] =
      origin === "guest"
        ? await connection`
            SELECT public.guest_create_preview_food_order(${stay.token},
              jsonb_build_array(jsonb_build_object('service_type_id', ${dishId}::uuid, 'quantity', 2)),
              NULL, 'asap') AS id
          `
        : await connection`
            SELECT public.staff_create_food_order(${stay.id},
              jsonb_build_array(jsonb_build_object('service_type_id', ${dishId}::uuid, 'quantity', 2)),
              NULL, 'asap') AS id
          `;
    return String((row as { id: string }).id);
  }

  async function checkout(connection: SQL, stay: Stay, override = false): Promise<number> {
    const [row] = await connection`
      SELECT public.checkout_stay(${stay.id}, ${override}) AS outstanding
    `;
    return Number((row as { outstanding: number }).outstanding);
  }

  async function expectStayStatus(stay: Stay, status: string) {
    const [row] = await sql`
      SELECT status::text AS status, checked_out_at IS NOT NULL AS checked_out
        FROM public.stays WHERE id = ${stay.id}
    `;
    expect((row as { status: string }).status).toBe(status);
    expect((row as { checked_out: boolean }).checked_out).toBe(status === "completed");
  }

  async function expectNoFulfillment(stay: Stay, orderId: string, status: string) {
    await expectStayStatus(stay, "active");
    const [row] = await sql`
      SELECT status, billable,
             (SELECT count(*)::int FROM public.charges WHERE source_food_order_id = ${orderId}) AS charges,
             (SELECT count(*)::int FROM public.inventory_movements WHERE source_id = ${orderId}) AS movements
        FROM public.preview_food_orders WHERE id = ${orderId}
    `;
    expect(row).toEqual({ status, billable: true, charges: 0, movements: 0 });
  }

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = db.sql;
    staffId = await createStaffUser(sql, "food_checkout_staff");
    await sql`
      INSERT INTO public.user_permissions(user_id, permission, granted) VALUES
        (${staffId}, 'reservations_manage', true),
        (${staffId}, 'checkout_override', true),
        (${staffId}, 'guest_access_manage', true)
    `;
    const [dish] = await sql`
      INSERT INTO public.service_types
        (key, label, default_price, billable, requestable, active, guest_visible,
         guest_category, guest_subcategory, preview_only, available_today)
      VALUES ('checkout_test_dish', 'Checkout test dish', 25, true, true, true, true,
              'food', 'mains', false, true)
      RETURNING id
    `;
    dishId = String((dish as { id: string }).id);
    const [ingredient] = await sql`
      INSERT INTO public.inventory_items(key, label, unit, active, preview_only)
      VALUES ('checkout_test_ingredient', 'Checkout test ingredient', 'kg', true, false)
      RETURNING id
    `;
    await sql`
      INSERT INTO public.inventory_recipe_components(service_type_id, inventory_item_id, qty_per_portion)
      VALUES (${dishId}, ${(ingredient as { id: string }).id}, 0.25)
    `;
    staff = await connectionFor("staff");
    guest = await connectionFor("guest");
  });

  afterAll(async () => {
    await db?.drop();
  });

  for (const origin of origins) {
    for (const status of openStatuses) {
      for (const override of [false, true]) {
        test(`${origin} ${status} order prevents checkout (override=${override})`, async () => {
          const stay = await createStay(`${origin} ${status} checkout`);
          const orderId = await createOrder(origin === "guest" ? guest : staff, origin, stay);
          if (status !== "requested") {
            await staff`SELECT public.preview_food_order_set_status(${orderId}, ${status})`;
          }

          await expectFailure(checkout(staff, stay, override), "FOOD_ORDERS_PENDING");
          await expectNoFulfillment(stay, orderId, status);
        });
      }
    }

    test(`${origin} cancelled order allows checkout without billing or consumption`, async () => {
      const stay = await createStay(`${origin} cancelled checkout`);
      const orderId = await createOrder(origin === "guest" ? guest : staff, origin, stay);
      await staff`SELECT public.preview_food_order_set_status(${orderId}, 'cancelled')`;
      await expectNoFulfillment(stay, orderId, "cancelled");
      expect(await checkout(staff, stay)).toBe(0);
      await expectStayStatus(stay, "completed");
    });

    test(`${origin} delivered order is billed and paid before ordinary checkout`, async () => {
      const stay = await createStay(`${origin} paid checkout`);
      const orderId = await createOrder(origin === "guest" ? guest : staff, origin, stay);
      await staff`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`;
      const [charge] = await sql`
        SELECT count(*)::int AS count, sum(total)::float8 AS total
          FROM public.charges WHERE source_food_order_id = ${orderId}
      `;
      expect(charge).toEqual({ count: 1, total: 50 });
      const [stock] = await sql`
        SELECT count(*)::int AS count, sum(quantity)::float8 AS quantity
          FROM public.inventory_movements WHERE source_id = ${orderId}
      `;
      expect(stock).toEqual({ count: 1, quantity: -0.5 });
      await expectFailure(checkout(staff, stay), "OVERRIDE_REQUIRED");
      await expectStayStatus(stay, "active");
      await staff`
        INSERT INTO public.payments(stay_id, amount, method, received_by)
        VALUES (${stay.id}, 25, 'cash', ${staffId})
      `;
      await expectFailure(checkout(staff, stay), "OVERRIDE_REQUIRED:25");
      await expectStayStatus(stay, "active");
      await staff`
        INSERT INTO public.payments(stay_id, amount, method, received_by)
        VALUES (${stay.id}, 25, 'cash', ${staffId})
      `;
      expect(await checkout(staff, stay)).toBe(0);
      await expectStayStatus(stay, "completed");
    });

    test(`${origin} order committed while checkout waits prevents checkout`, async () => {
      const stay = await createStay(`${origin} order wins race`);
      const ordering = await connectionFor(origin);
      const checkingOut = await connectionFor("staff");
      const orderingPid = await backendPid(ordering);
      const checkoutPid = await backendPid(checkingOut);
      let pending: ReturnType<typeof observe<number>> | undefined;
      await ordering.unsafe("BEGIN");
      try {
        const orderId = await createOrder(ordering, origin, stay);
        pending = observe(checkout(checkingOut, stay));
        await waitForBlocking(sql, checkoutPid, orderingPid, pending.isSettled);
        await ordering.unsafe("COMMIT");

        const result = await pending.result;
        expect("error" in result).toBe(true);
        if ("error" in result) expect(String(result.error)).toContain("FOOD_ORDERS_PENDING");
        await expectNoFulfillment(stay, orderId, "requested");
      } finally {
        await ordering.unsafe("ROLLBACK");
        await pending?.result;
      }
    });

    test(`${origin} order waiting behind checkout cannot attach to the completed stay`, async () => {
      const stay = await createStay(`${origin} checkout wins race`);
      const checkingOut = await connectionFor("staff");
      const ordering = await connectionFor(origin);
      const checkoutPid = await backendPid(checkingOut);
      const orderingPid = await backendPid(ordering);
      let pending: ReturnType<typeof observe<string>> | undefined;
      await checkingOut.unsafe("BEGIN");
      try {
        expect(await checkout(checkingOut, stay)).toBe(0);
        pending = observe(createOrder(ordering, origin, stay));
        await waitForBlocking(sql, orderingPid, checkoutPid, pending.isSettled);
        await checkingOut.unsafe("COMMIT");

        const result = await pending.result;
        expect("error" in result).toBe(true);
        if ("error" in result) {
          const message = String(result.error);
          expect(message.includes("STAY_NOT_ACTIVE") || message.includes("INVALID_TOKEN")).toBe(
            true,
          );
        }
        await expectStayStatus(stay, "completed");
        const [row] = await sql`
          SELECT count(*)::int AS count FROM public.preview_food_orders WHERE stay_id = ${stay.id}
        `;
        expect((row as { count: number }).count).toBe(0);
      } finally {
        await checkingOut.unsafe("ROLLBACK");
        await pending?.result;
      }
    });
  }

  test("checkout rejects an open order without deadlocking its concurrent delivery", async () => {
    const stay = await createStay("Delivery and checkout lock ordering");
    const orderId = await createOrder(staff, "staff", stay);
    const delivering = db.connect();
    const checkingOut = db.connect();
    for (const connection of [delivering, checkingOut]) {
      await connection.unsafe("SET statement_timeout = '6s'");
      await actAs(connection, staffId);
      await connection`SELECT set_config('request.jwt.claim.role', 'authenticated', false)`;
    }
    const deliveryPid = await backendPid(delivering);
    const checkoutPid = await backendPid(checkingOut);
    let pending: ReturnType<typeof observe<unknown[]>> | undefined;
    try {
      await delivering.unsafe("BEGIN");
      await checkingOut.unsafe("BEGIN");
      // Only these fixture locks use the database owner; both RPCs below run as authenticated.
      await delivering`SELECT id FROM public.preview_food_orders WHERE id = ${orderId} FOR UPDATE`;
      await checkingOut`SELECT id FROM public.stays WHERE id = ${stay.id} FOR UPDATE`;
      await delivering.unsafe("SET LOCAL ROLE authenticated");
      await checkingOut.unsafe("SET LOCAL ROLE authenticated");

      pending = observe(
        delivering`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`,
      );
      await waitForBlocking(sql, deliveryPid, checkoutPid, pending.isSettled);

      // Checkout must read the open order without requesting its row lock. A lock request
      // here creates a cycle: checkout owns the stay, while delivery owns the order.
      await expectFailure(checkout(checkingOut, stay), "FOOD_ORDERS_PENDING");
      await checkingOut.unsafe("ROLLBACK");
      const result = await pending.result;
      expect("value" in result).toBe(true);
      await delivering.unsafe("COMMIT");

      await expectStayStatus(stay, "active");
      const [row] = await sql`
        SELECT status,
               (SELECT count(*)::int FROM public.charges WHERE source_food_order_id = ${orderId}) AS charges,
               (SELECT sum(total)::float8 FROM public.charges WHERE source_food_order_id = ${orderId}) AS total,
               (SELECT count(*)::int FROM public.inventory_movements WHERE source_id = ${orderId}) AS movements,
               (SELECT sum(quantity)::float8 FROM public.inventory_movements WHERE source_id = ${orderId}) AS quantity
          FROM public.preview_food_orders WHERE id = ${orderId}
      `;
      expect(row).toEqual({
        status: "delivered",
        charges: 1,
        total: 50,
        movements: 1,
        quantity: -0.5,
      });
    } finally {
      // Release the stay first so an in-flight delivery can finish before its rollback.
      await checkingOut.unsafe("ROLLBACK");
      await pending?.result;
      await delivering.unsafe("ROLLBACK");
    }
  });

  test("checkout rejects an uncommitted cancellation without waiting for its order lock", async () => {
    const stay = await createStay("Cancellation and checkout visibility");
    const orderId = await createOrder(staff, "staff", stay);
    const cancelling = await connectionFor("staff");
    const checkingOut = await connectionFor("staff");
    await cancelling.unsafe("BEGIN");
    try {
      await cancelling`SELECT public.preview_food_order_set_status(${orderId}, 'cancelled')`;
      // The completed RPC still holds the order lock in this uncommitted transaction.
      // Checkout must reject using the visible requested row before we release that lock.
      await expectFailure(checkout(checkingOut, stay), "FOOD_ORDERS_PENDING");
      await expectNoFulfillment(stay, orderId, "requested");
      await cancelling.unsafe("COMMIT");

      await expectNoFulfillment(stay, orderId, "cancelled");
      expect(await checkout(checkingOut, stay)).toBe(0);
      await expectStayStatus(stay, "completed");
      const [row] = await sql`
        SELECT
          (SELECT count(*)::int FROM public.charges WHERE source_food_order_id = ${orderId}) AS charges,
          (SELECT count(*)::int FROM public.inventory_movements WHERE source_id = ${orderId}) AS movements
      `;
      expect(row).toEqual({ charges: 0, movements: 0 });
    } finally {
      await cancelling.unsafe("ROLLBACK");
    }
  });

  test("a pending legacy nonbillable order does not prevent checkout or become a charge", async () => {
    const stay = await createStay("Legacy checkout");
    await sql`INSERT INTO public.preview_food_orders(stay_id, subtotal) VALUES (${stay.id}, 50)`;
    expect(await checkout(staff, stay)).toBe(0);
    await expectStayStatus(stay, "completed");
    const [row] = await sql`
      SELECT billable, status,
             (SELECT count(*)::int FROM public.charges WHERE stay_id = ${stay.id}) AS charges
        FROM public.preview_food_orders WHERE stay_id = ${stay.id}
    `;
    expect(row).toEqual({ billable: false, status: "requested", charges: 0 });
  });

  test("balance override still works after all restaurant orders are resolved", async () => {
    const stay = await createStay("Resolved order with balance override", 100);
    const orderId = await createOrder(staff, "staff", stay);
    await staff`SELECT public.preview_food_order_set_status(${orderId}, 'cancelled')`;
    expect(await checkout(staff, stay, true)).toBe(100);
    await expectStayStatus(stay, "completed");
  });
});
