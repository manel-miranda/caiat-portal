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

async function createSupervisor(sql: SQL): Promise<string> {
  const [user] = await sql`
    INSERT INTO auth.users (email) VALUES ('billing-supervisor@example.test') RETURNING id
  `;
  const id = String((user as { id: string }).id);
  await sql`
    INSERT INTO public.profiles(id, username, full_name)
    VALUES (${id}, 'billing_supervisor', 'Billing Supervisor')
  `;
  await sql`
    INSERT INTO public.user_roles(user_id, role)
    VALUES (${id}, 'supervisor'::public.app_role)
  `;
  return id;
}

suite("request billing permission", () => {
  let db: TestDatabase;
  let sql: SQL;
  let staffId: string;
  let supervisorId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = db.sql;
    staffId = await createStaffUser(sql, "request_only_staff");
    supervisorId = await createSupervisor(sql);
    await sql`
      INSERT INTO public.user_permissions(user_id, permission, granted)
      VALUES (${staffId}, 'payments_manage', false)
      ON CONFLICT (user_id, permission) DO UPDATE SET granted = false
    `;
  });

  afterAll(async () => {
    await db?.drop();
  });

  test("requests_manage without payments_manage cannot create a charge through complete_request", async () => {
    await actAs(sql, supervisorId);
    const [room] = await sql`SELECT id FROM public.rooms ORDER BY number LIMIT 1`;
    const roomId = String((room as { id: string }).id);
    const [stay] = await sql`
      SELECT public.create_stay_with_guest(
        'Billing Permission Guest', ${roomId}, DATE '2041-01-01', DATE '2041-01-02',
        1, 'walk_in'::public.stay_source, 0, NULL, 'confirmed', NULL, NULL, NULL
      ) AS id
    `;
    const stayId = String((stay as { id: string }).id);
    const [service] = await sql`
      INSERT INTO public.service_types(key, label, default_price, billable, requestable, active)
      VALUES ('billing_permission_service', 'Billing permission service', 25, true, true, true)
      RETURNING id
    `;
    const serviceId = String((service as { id: string }).id);
    const [request] = await sql`
      INSERT INTO public.requests(stay_id, room_id, service_type_id, label, status)
      VALUES (${stayId}, ${roomId}, ${serviceId}, 'Billing permission service', 'pending')
      RETURNING id
    `;
    const requestId = String((request as { id: string }).id);

    const staffSql = db.connect();
    await staffSql.unsafe("SET ROLE authenticated");
    await actAs(staffSql, staffId);

    let denied = false;
    try {
      await staffSql`SELECT public.complete_request(${requestId}, true)`;
    } catch (error) {
      denied = true;
      expect(String(error)).toContain("PERMISSION_DENIED:payments_manage");
    }
    expect(denied).toBe(true);

    const [chargeCount] = await sql`
      SELECT count(*)::int AS n FROM public.charges WHERE source_request_id = ${requestId}
    `;
    expect(Number((chargeCount as { n: number }).n)).toBe(0);
    const [state] = await sql`SELECT status FROM public.requests WHERE id = ${requestId}`;
    expect(String((state as { status: string }).status)).toBe("pending");

    const [completed] = await staffSql`SELECT public.complete_request(${requestId}, false) AS id`;
    expect(String((completed as { id: string }).id)).toBe(requestId);
    const [after] = await sql`SELECT status FROM public.requests WHERE id = ${requestId}`;
    expect(String((after as { status: string }).status)).toBe("completed");
  });
});
