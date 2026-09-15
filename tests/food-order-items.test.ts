/** Item write boundaries exercised as real client roles against migrated PostgreSQL. */
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
type Origin = "guest" | "staff";
type Stay = { id: string; token: string };

suite("protected restaurant order items", () => {
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

  async function createStay(name: string): Promise<Stay> {
    const [room] = await sql`SELECT id FROM public.rooms ORDER BY number LIMIT 1`;
    const [person] = await sql`INSERT INTO public.guests(full_name) VALUES (${name}) RETURNING id`;
    const [row] = await sql`
      INSERT INTO public.stays(guest_id, room_id, check_in, check_out, num_guests, source,
                               accommodation_total, status, confirmation_status)
      VALUES (${(person as { id: string }).id}, ${(room as { id: string }).id},
              CURRENT_DATE, CURRENT_DATE + 1, 1, 'walk_in', 0, 'active', 'confirmed')
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

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = db.sql;
    staffId = await createStaffUser(sql, "food_items_staff");
    await sql`
      INSERT INTO public.user_permissions(user_id, permission, granted) VALUES
        (${staffId}, 'payments_manage', true),
        (${staffId}, 'guest_access_manage', true)
    `;
    const [dish] = await sql`
      INSERT INTO public.service_types
        (key, label, default_price, billable, requestable, active, guest_visible,
         guest_category, guest_subcategory, preview_only, available_today)
      VALUES ('items_test_dish', 'Items test dish', 25, true, true, true, true,
              'food', 'mains', false, true)
      RETURNING id
    `;
    dishId = String((dish as { id: string }).id);
    const [ingredient] = await sql`
      INSERT INTO public.inventory_items(key, label, unit, active, preview_only)
      VALUES ('items_test_ingredient', 'Items test ingredient', 'kg', true, false)
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

  async function snapshot(orderId: string) {
    const [order] = await sql`
      SELECT status, subtotal::float8 AS subtotal, billable
      FROM public.preview_food_orders WHERE id = ${orderId}
    `;
    const items = await sql`
      SELECT id, service_type_id, label, quantity, unit_price::float8 AS unit_price,
             line_total::float8 AS line_total
      FROM public.preview_food_order_items WHERE order_id = ${orderId} ORDER BY id
    `;
    const charges = await sql`
      SELECT id, source_food_order_item_id, quantity::float8 AS quantity,
             unit_price::float8 AS unit_price, total::float8 AS total
      FROM public.charges WHERE source_food_order_id = ${orderId} ORDER BY id
    `;
    const movements = await sql`
      SELECT id, inventory_item_id, movement_type, quantity::float8 AS quantity
      FROM public.inventory_movements WHERE source_id = ${orderId} ORDER BY id
    `;
    return { order, items: [...items], charges: [...charges], movements: [...movements] };
  }

  function expectFields(actual: unknown, expected: Record<string, unknown>) {
    for (const [key, value] of Object.entries(expected)) {
      expect((actual as Record<string, unknown>)[key]).toEqual(value);
    }
  }

  async function denied(operation: Promise<unknown>) {
    let error: unknown;
    try {
      await operation;
    } catch (caught) {
      error = caught;
    }
    expect(String(error)).toContain("permission denied for table preview_food_order_items");
  }

  async function expectWritesDenied(client: SQL, orderId: string) {
    const before = await snapshot(orderId);
    const itemId = String((before.items[0] as { id: string }).id);
    await denied(client`DELETE FROM public.preview_food_order_items WHERE id = ${itemId}`);
    await denied(client`
      INSERT INTO public.preview_food_order_items(order_id, service_type_id, label, unit_price, quantity, line_total)
      VALUES (${orderId}, ${dishId}, 'Injected item', 1, 20, 20)
    `);
    await denied(client`
      UPDATE public.preview_food_order_items SET quantity = 20, unit_price = 1, line_total = 20
      WHERE id = ${itemId}
    `);
    expect(await snapshot(orderId)).toEqual(before);
  }

  test("client roles have no item write privileges or write policies", async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const privilege of ["INSERT", "UPDATE", "DELETE"]) {
        const [row] = await sql`
          SELECT has_table_privilege(${role}, 'public.preview_food_order_items', ${privilege}) AS allowed
        `;
        expect(row).toEqual({ allowed: false });
      }
    }
    const policies = await sql`
      SELECT policyname, cmd FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'preview_food_order_items'
    `;
    expect([...policies]).toEqual([{ policyname: "preview order items read", cmd: "SELECT" }]);
    const [role] =
      await staff`SELECT current_user AS role, public.has_permission(auth.uid(), 'requests_manage') AS allowed`;
    expect(role).toEqual({ role: "authenticated", allowed: true });
    for (const privilege of ["INSERT", "UPDATE", "DELETE"]) {
      const [service] = await sql`
        SELECT has_table_privilege('service_role', 'public.preview_food_order_items', ${privilege}) AS allowed
      `;
      expect(service).toEqual({ allowed: true });
    }
  });

  for (const origin of ["guest", "staff"] as const) {
    test(`${origin} items resist client writes throughout fulfillment and bill/consume exactly once`, async () => {
      const stay = await createStay(`${origin} protected items`);
      const orderId = await createOrder(origin === "guest" ? guest : staff, origin, stay);
      const original = await snapshot(orderId);
      expect(original.order).toEqual({ status: "requested", subtotal: 50, billable: true });
      expect(original.items.length).toBe(1);
      expectFields(original.items[0], { quantity: 2, unit_price: 25, line_total: 50 });
      // Authorized staff can still read the nested items used by the kitchen UI.
      expect(
        (await staff`SELECT id FROM public.preview_food_order_items WHERE order_id = ${orderId}`)
          .length,
      ).toBe(1);
      for (const status of ["requested", "accepted", "preparing", "ready", "delivered"]) {
        if (status !== "requested")
          await staff`SELECT public.preview_food_order_set_status(${orderId}, ${status})`;
        for (const client of [staff, guest]) await expectWritesDenied(client, orderId);
        const state = await snapshot(orderId);
        expect(state.items).toEqual(original.items);
        expect(state.order).toEqual({ status, subtotal: 50, billable: true });
        if (status !== "delivered") {
          expect(state.charges.length).toBe(0);
          expect(state.movements.length).toBe(0);
        }
      }
      const delivered = await snapshot(orderId);
      expect(delivered.charges.length).toBe(1);
      expectFields(delivered.charges[0], {
        source_food_order_item_id: (original.items[0] as { id: string }).id,
        quantity: 2,
        unit_price: 25,
        total: 50,
      });
      expect(delivered.movements.length).toBe(1);
      expectFields(delivered.movements[0], {
        movement_type: "consumption",
        quantity: -0.5,
      });
      const other = await connectionFor("staff");
      await Promise.all([
        staff`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`,
        other`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`,
      ]);
      expect(await snapshot(orderId)).toEqual(delivered);
    });

    test(`${origin} cancellation preserves items without charges or consumption`, async () => {
      const stay = await createStay(`${origin} cancelled items`);
      const orderId = await createOrder(origin === "guest" ? guest : staff, origin, stay);
      const original = await snapshot(orderId);
      await staff`SELECT public.preview_food_order_set_status(${orderId}, 'cancelled')`;
      await expectWritesDenied(staff, orderId);
      await staff`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`;
      expect(await snapshot(orderId)).toEqual({
        ...original,
        order: { status: "cancelled", subtotal: 50, billable: true },
      });
    });
  }

  test("historical nonbillable items remain intact and delivery only consumes inventory", async () => {
    const stay = await createStay("Historical items");
    const [row] = await sql`
      INSERT INTO public.preview_food_orders(stay_id, subtotal) VALUES (${stay.id}, 50) RETURNING id
    `;
    const orderId = String((row as { id: string }).id);
    await sql`
      INSERT INTO public.preview_food_order_items(order_id, service_type_id, label, unit_price, quantity, line_total)
      VALUES (${orderId}, ${dishId}, 'Historical dish', 25, 2, 50)
    `;
    await sql`UPDATE public.stays SET status = 'completed' WHERE id = ${stay.id}`;
    const original = await snapshot(orderId);
    await expectWritesDenied(staff, orderId);
    await staff`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`;
    const delivered = await snapshot(orderId);
    expect(delivered.items).toEqual(original.items);
    expect(delivered.order).toEqual({ status: "delivered", subtotal: 50, billable: false });
    expect(delivered.charges.length).toBe(0);
    expect(delivered.movements.length).toBe(1);
    expectFields(delivered.movements[0], { quantity: -0.5 });
    await staff`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`;
    expect(await snapshot(orderId)).toEqual(delivered);
  });
});
