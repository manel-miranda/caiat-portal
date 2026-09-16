import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SQL } from "bun";
import {
  actAs,
  createTestDatabase,
  databaseAvailable,
  type TestDatabase,
} from "./support/preview-db";

const canRun = databaseAvailable();
const suite = canRun ? describe : describe.skip;

async function createAdminUser(sql: SQL): Promise<string> {
  const [user] = await sql`
    INSERT INTO auth.users (email) VALUES ('catalogue-admin@example.test') RETURNING id
  `;
  const id = String((user as { id: string }).id);
  await sql`
    INSERT INTO public.profiles (id, username, full_name)
    VALUES (${id}, 'catalogue_admin', 'Catalogue Admin')
  `;
  await sql`INSERT INTO public.user_roles (user_id, role) VALUES (${id}, 'admin')`;
  return id;
}

async function createCatalogueItem(sql: SQL, key: string): Promise<string> {
  const [row] = await sql`
    SELECT public.catalog_upsert_service(
      NULL::uuid,
      ${key},
      'Hardening test item',
      120::numeric,
      true,
      true,
      true,
      true,
      'food',
      'food',
      'meals',
      'Test item',
      NULL,
      NULL,
      0,
      0,
      false,
      false,
      '{}'::jsonb,
      '{}'::jsonb
    ) AS id
  `;
  return String((row as { id: string }).id);
}

suite("catalogue production hardening", () => {
  let db: TestDatabase;
  let sql: SQL;

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = db.sql;
    await actAs(sql, await createAdminUser(sql));
  });

  afterAll(async () => {
    await db?.drop();
  });

  test("new items are created inactive, non-requestable and hidden even when requested live", async () => {
    const id = await createCatalogueItem(sql, "hardening_new_item");
    const [item] = await sql`
      SELECT active, requestable, guest_visible
        FROM public.service_types
       WHERE id = ${id}
    `;

    expect(Boolean((item as { active: boolean }).active)).toBe(false);
    expect(Boolean((item as { requestable: boolean }).requestable)).toBe(false);
    expect(Boolean((item as { guest_visible: boolean }).guest_visible)).toBe(false);
  });

  test("existing service keys cannot be renamed", async () => {
    const id = await createCatalogueItem(sql, "hardening_stable_key");

    let error: unknown;
    try {
      await sql`
        SELECT public.catalog_upsert_service(
          ${id}::uuid,
          'hardening_changed_key',
          'Renamed item',
          120::numeric,
          true,
          false,
          false,
          false,
          'food',
          'food',
          'meals',
          'Test item',
          NULL,
          NULL,
          0,
          0,
          false,
          false,
          '{}'::jsonb,
          '{}'::jsonb
        )
      `;
    } catch (caught) {
      error = caught;
    }

    expect(String((error as Error | undefined)?.message ?? error)).toContain("KEY_IMMUTABLE");

    const [item] = await sql`SELECT key FROM public.service_types WHERE id = ${id}`;
    expect(String((item as { key: string }).key)).toBe("hardening_stable_key");
  });

  test("an admin can explicitly publish a previously saved item without changing its key", async () => {
    const id = await createCatalogueItem(sql, "hardening_publish_later");

    await sql`
      SELECT public.catalog_upsert_service(
        ${id}::uuid,
        'hardening_publish_later',
        'Published later',
        120::numeric,
        true,
        true,
        true,
        true,
        'food',
        'food',
        'meals',
        'Test item',
        NULL,
        NULL,
        0,
        0,
        false,
        false,
        '{}'::jsonb,
        '{}'::jsonb
      )
    `;

    const [item] = await sql`
      SELECT active, requestable, guest_visible
        FROM public.service_types
       WHERE id = ${id}
    `;
    expect(Boolean((item as { active: boolean }).active)).toBe(true);
    expect(Boolean((item as { requestable: boolean }).requestable)).toBe(true);
    expect(Boolean((item as { guest_visible: boolean }).guest_visible)).toBe(true);
  });
});
