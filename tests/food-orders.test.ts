/**
 * Kitchen food order regression tests: guest/staff parity, once-only billing on
 * delivery, cancellation, unauthorized actors, closed stays and legacy isolation.
 */
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

type Charge = { label: string; quantity: number; unit_price: number; total: number };

async function menuDish(sql: SQL): Promise<{ id: string; price: number; label: string }> {
  const [row] = await sql`
    SELECT id, default_price::float8 AS price, label
      FROM public.service_types
     WHERE guest_category = 'food' AND NOT preview_only AND active AND requestable
     ORDER BY label LIMIT 1
  `;
  const r = row as { id: string; price: number; label: string };
  return { id: String(r.id), price: Number(r.price), label: String(r.label) };
}

async function createStay(sql: SQL, name: string): Promise<string> {
  const [room] = await sql`SELECT id FROM public.rooms ORDER BY number LIMIT 1`;
  const [guest] = await sql`INSERT INTO public.guests(full_name) VALUES (${name}) RETURNING id`;
  const [stay] = await sql`
    INSERT INTO public.stays (guest_id, room_id, check_in, check_out, num_guests, source,
                              accommodation_total, status, confirmation_status)
    VALUES (${(guest as { id: string }).id}, ${(room as { id: string }).id},
            CURRENT_DATE, CURRENT_DATE + 1, 1, 'walk_in', 0, 'active', 'confirmed')
    RETURNING id
  `;
  return String((stay as { id: string }).id);
}

async function chargesFor(sql: SQL, orderId: string): Promise<Charge[]> {
  const rows = await sql`
    SELECT label, quantity::float8 AS quantity, unit_price::float8 AS unit_price,
           total::float8 AS total
      FROM public.charges WHERE source_food_order_id = ${orderId} ORDER BY label
  `;
  return rows as unknown as Charge[];
}

suite("kitchen food orders", () => {
  let db: TestDatabase;
  let sql: SQL;
  let staffId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = db.sql;
    staffId = await createStaffUser(sql, "kitchen_staff");
    await actAs(sql, staffId);
  });

  afterAll(async () => {
    await db?.drop();
  });

  test("staff order bills the guest exactly once on delivery, with quantity and price snapshots", async () => {
    const stayId = await createStay(sql, "Kitchen Staff Guest");
    const dish = await menuDish(sql);
    const [created] = await sql`
      SELECT public.staff_create_food_order(
        ${stayId},
        jsonb_build_array(jsonb_build_object('service_type_id', ${dish.id}::uuid, 'quantity', 3)),
        'no salt', 'asap') AS id
    `;
    const orderId = String((created as { id: string }).id);

    const [row] = await sql`
      SELECT origin, billable, subtotal::float8 AS subtotal
        FROM public.preview_food_orders WHERE id = ${orderId}
    `;
    const order = row as { origin: string; billable: boolean; subtotal: number };
    expect(order.origin).toBe("staff");
    expect(order.billable).toBe(true);
    expect(order.subtotal).toBe(dish.price * 3);

    // Not billed before delivery.
    await sql`SELECT public.preview_food_order_set_status(${orderId}, 'accepted')`;
    expect((await chargesFor(sql, orderId)).length).toBe(0);

    await sql`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`;
    const charges = await chargesFor(sql, orderId);
    expect(charges.length).toBe(1);
    expect(Number(charges[0]?.quantity)).toBe(3);
    expect(Number(charges[0]?.unit_price)).toBe(dish.price);
    expect(Number(charges[0]?.total)).toBe(dish.price * 3);

    // Repeated delivery (and a concurrent replay) never doubles the bill.
    await sql`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`;
    const second = db.connect();
    await actAs(second, staffId);
    await second`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`;
    expect((await chargesFor(sql, orderId)).length).toBe(1);

    // Terminal state stays terminal.
    await sql`SELECT public.preview_food_order_set_status(${orderId}, 'cancelled')`;
    const [after] = await sql`SELECT status FROM public.preview_food_orders WHERE id = ${orderId}`;
    expect(String((after as { status: string }).status)).toBe("delivered");
  });

  test("guest order through the token RPC behaves identically", async () => {
    const stayId = await createStay(sql, "Kitchen Guest");
    const token = String(
      ((await sql`SELECT public.guest_token_generate(${stayId}) AS t`)[0] as { t: string }).t,
    );
    const dish = await menuDish(sql);
    const [created] = await sql`
      SELECT public.guest_create_preview_food_order(
        ${token},
        jsonb_build_array(jsonb_build_object('service_type_id', ${dish.id}::uuid, 'quantity', 2)),
        NULL, 'asap') AS id
    `;
    const orderId = String((created as { id: string }).id);
    const [row] = await sql`
      SELECT origin, billable FROM public.preview_food_orders WHERE id = ${orderId}
    `;
    expect((row as { origin: string }).origin).toBe("guest");
    expect((row as { billable: boolean }).billable).toBe(true);

    await sql`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`;
    const charges = await chargesFor(sql, orderId);
    expect(charges.length).toBe(1);
    expect(Number(charges[0]?.quantity)).toBe(2);
    expect(Number(charges[0]?.total)).toBe(dish.price * 2);
  });

  test("cancelled orders never bill and never consume stock", async () => {
    const stayId = await createStay(sql, "Cancelled Guest");
    const dish = await menuDish(sql);
    const [created] = await sql`
      SELECT public.staff_create_food_order(
        ${stayId},
        jsonb_build_array(jsonb_build_object('service_type_id', ${dish.id}::uuid, 'quantity', 1)),
        NULL, 'asap') AS id
    `;
    const orderId = String((created as { id: string }).id);
    await sql`SELECT public.preview_food_order_set_status(${orderId}, 'cancelled')`;
    expect((await chargesFor(sql, orderId)).length).toBe(0);
    const [moves] = await sql`
      SELECT count(*)::int AS n FROM public.inventory_movements WHERE source_id = ${orderId}
    `;
    expect(Number((moves as { n: number }).n)).toBe(0);
  });

  test("legacy / demo orders stay non-billable on delivery", async () => {
    const stayId = await createStay(sql, "Legacy Guest");
    const dish = await menuDish(sql);
    const [legacy] = await sql`
      INSERT INTO public.preview_food_orders(stay_id, subtotal) VALUES (${stayId}, 100) RETURNING id
    `;
    const orderId = String((legacy as { id: string }).id);
    await sql`
      INSERT INTO public.preview_food_order_items(order_id, service_type_id, label, unit_price,
                                                  quantity, line_total)
      VALUES (${orderId}, ${dish.id}, ${dish.label}, 100, 1, 100)
    `;
    await sql`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`;
    expect((await chargesFor(sql, orderId)).length).toBe(0);
  });

  test("a closed stay is never charged after delivery", async () => {
    const stayId = await createStay(sql, "Closed Guest");
    const dish = await menuDish(sql);
    const [created] = await sql`
      SELECT public.staff_create_food_order(
        ${stayId},
        jsonb_build_array(jsonb_build_object('service_type_id', ${dish.id}::uuid, 'quantity', 1)),
        NULL, 'asap') AS id
    `;
    const orderId = String((created as { id: string }).id);
    await sql`UPDATE public.stays SET status = 'completed' WHERE id = ${stayId}`;
    await sql`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`;
    expect((await chargesFor(sql, orderId)).length).toBe(0);
  });

  test("staff order requires an active confirmed stay", async () => {
    const stayId = await createStay(sql, "Pending Guest");
    await sql`UPDATE public.stays SET confirmation_status = 'pending' WHERE id = ${stayId}`;
    const dish = await menuDish(sql);
    let denied = false;
    try {
      await sql`
        SELECT public.staff_create_food_order(
          ${stayId},
          jsonb_build_array(jsonb_build_object('service_type_id', ${dish.id}::uuid, 'quantity', 1)),
          NULL, 'asap')
      `;
    } catch (error) {
      denied = true;
      expect(String(error)).toContain("STAY_NOT_ACTIVE");
    }
    expect(denied).toBe(true);
  });

  test("users without requests_manage cannot create orders or bill them", async () => {
    const stayId = await createStay(sql, "Outsider Guest");
    const dish = await menuDish(sql);
    const [outsider] = await sql`
      INSERT INTO auth.users (email) VALUES ('kitchen-outsider@example.test') RETURNING id
    `;
    const outsiderSql = db.connect();
    await actAs(outsiderSql, String((outsider as { id: string }).id));

    let deniedCreate = false;
    try {
      await outsiderSql`
        SELECT public.staff_create_food_order(
          ${stayId},
          jsonb_build_array(jsonb_build_object('service_type_id', ${dish.id}::uuid, 'quantity', 1)),
          NULL, 'asap')
      `;
    } catch (error) {
      deniedCreate = true;
      expect(String(error)).toContain("PERMISSION_DENIED");
    }
    expect(deniedCreate).toBe(true);

    const [created] = await sql`
      SELECT public.staff_create_food_order(
        ${stayId},
        jsonb_build_array(jsonb_build_object('service_type_id', ${dish.id}::uuid, 'quantity', 1)),
        NULL, 'asap') AS id
    `;
    const orderId = String((created as { id: string }).id);
    let deniedStatus = false;
    try {
      await outsiderSql`SELECT public.preview_food_order_set_status(${orderId}, 'delivered')`;
    } catch (error) {
      deniedStatus = true;
      expect(String(error)).toContain("PERMISSION_DENIED");
    }
    expect(deniedStatus).toBe(true);
    expect((await chargesFor(sql, orderId)).length).toBe(0);
  });
});
