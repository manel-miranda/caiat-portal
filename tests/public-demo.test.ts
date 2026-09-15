import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  actAs,
  createTestDatabase,
  databaseAvailable,
  type TestDatabase,
} from "./support/preview-db";

const install = await readFile(new URL("../scripts/demo/install.sql", import.meta.url), "utf8");
const run = databaseAvailable() ? describe : describe.skip;
run("isolated public demo database", () => {
  let db: TestDatabase;
  let visitor: string;
  type Row = {
    id: string;
    role: string;
    allowed: boolean;
    provider: string;
    notes: string;
    status: string;
    n: number;
  };
  async function q(strings: TemplateStringsArray, ...values: unknown[]): Promise<Row[]> {
    return (await db.sql(strings, ...values)) as Row[];
  }
  beforeAll(async () => {
    db = await createTestDatabase();
    // Remove historical test identities and their optional actor references.
    // The hosted demo baseline was already sanitized; production is never targeted.
    await db.sql.unsafe(`DO $$ DECLARE r record; BEGIN
      FOR r IN SELECT c.relname, a.attname FROM pg_constraint fk
        JOIN pg_class c ON c.oid = fk.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(fk.conkey)
        WHERE fk.contype = 'f' AND fk.confrelid = 'auth.users'::regclass
          AND n.nspname = 'public' AND NOT a.attnotnull
      LOOP EXECUTE format('UPDATE public.%I SET %I = NULL', r.relname, r.attname); END LOOP;
    END $$;
    DELETE FROM public.user_permissions; DELETE FROM public.user_roles; DELETE FROM public.profiles;
    DELETE FROM auth.users;
    ALTER TABLE auth.users ADD COLUMN raw_app_meta_data jsonb DEFAULT '{}',
      ADD COLUMN encrypted_password text, ADD COLUMN last_sign_in_at timestamptz,
      ADD COLUMN updated_at timestamptz;
    CREATE TABLE auth.identities(id uuid DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users,
      provider text, identity_data jsonb, last_sign_in_at timestamptz, updated_at timestamptz);
    CREATE TABLE auth.mfa_factors(id uuid DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users);
    `);
    await expect(Promise.resolve(db.sql.unsafe(install))).rejects.toThrow("DEMO_TARGET_REQUIRED");
    await q`SELECT set_config('caiat.demo_target', 'llyihdkuplsyduxirvcg', false)`;
    await db.sql.unsafe(`BEGIN; ${install} COMMIT;`);
    visitor = "df101cea-e2ed-4a3a-956b-b817038bb648";
    await db.sql.unsafe("BEGIN");
    await q`INSERT INTO auth.users(id, email, encrypted_password)
      VALUES (${visitor}, 'public-demo@caiat.invalid', 'test-only')`;
    // Mirror Auth Admin API's post-insert updates within the creation transaction.
    await q`UPDATE auth.users SET raw_app_meta_data = '{"caiat_demo":true}' WHERE id = ${visitor}`;
    await db.sql.unsafe("COMMIT");
    await actAs(db.sql, visitor);
  }, 60_000);
  afterAll(async () => {
    if (db) await db.drop();
  });

  test("one fictional account, no browser registration or credential/MFA changes", async () => {
    expect((await q`SELECT role FROM public.user_roles WHERE user_id = ${visitor}`)[0]!.role).toBe(
      "supervisor",
    );
    await expect(
      Promise.resolve(q`INSERT INTO auth.users(email, raw_user_meta_data)
      VALUES ('intruder@example.test', '{"caiat_demo":true}')`),
    ).rejects.toThrow("DEMO_SECURITY_LOCKED");
    await expect(
      Promise.resolve(
        q`UPDATE auth.users SET encrypted_password = 'changed' WHERE id = ${visitor}`,
      ),
    ).rejects.toThrow("DEMO_SECURITY_LOCKED");
    await expect(
      Promise.resolve(
        q`UPDATE auth.users SET email = 'changed@example.test' WHERE id = ${visitor}`,
      ),
    ).rejects.toThrow("DEMO_SECURITY_LOCKED");
    await expect(
      Promise.resolve(
        q`UPDATE auth.users SET raw_app_meta_data = '{"role":"admin"}' WHERE id = ${visitor}`,
      ),
    ).rejects.toThrow("DEMO_SECURITY_LOCKED");
    await expect(
      Promise.resolve(q`INSERT INTO auth.mfa_factors(user_id) VALUES (${visitor})`),
    ).rejects.toThrow("DEMO_SECURITY_LOCKED");
    await expect(
      Promise.resolve(
        q`INSERT INTO auth.identities(user_id, provider) VALUES (${visitor}, 'github')`,
      ),
    ).rejects.toThrow("DEMO_SECURITY_LOCKED");
    await q`UPDATE auth.users SET last_sign_in_at = now(), updated_at = now() WHERE id = ${visitor}`;
  });

  test("raw authenticated calls cannot change security or reset data", async () => {
    await db.sql.unsafe("SET ROLE authenticated");
    try {
      for (const key of ["users_manage", "roles_manage", "pin_reset"]) {
        expect(
          (await q`SELECT public.has_permission(${visitor}, ${key}) allowed`)[0]!.allowed,
        ).toBe(false);
      }
      expect((await q`SELECT public.has_role(${visitor}, 'admin') allowed`)[0]!.allowed).toBe(
        false,
      );
      await expect(
        Promise.resolve(q`SELECT public.set_user_role(${visitor}, 'admin')`),
      ).rejects.toThrow("permission denied");
      await expect(
        Promise.resolve(q`SELECT public.set_user_permission(${visitor}, 'roles_manage', true)`),
      ).rejects.toThrow("permission denied");
      await expect(
        Promise.resolve(q`SELECT public.set_user_active(${visitor}, false)`),
      ).rejects.toThrow("permission denied");
      await expect(
        Promise.resolve(q`UPDATE public.profiles SET username = 'admin' WHERE id = ${visitor}`),
      ).rejects.toThrow("permission denied");
      await expect(
        Promise.resolve(
          q`INSERT INTO public.user_roles(user_id, role) VALUES (${visitor}, 'admin')`,
        ),
      ).rejects.toThrow("permission denied");
      await expect(Promise.resolve(db.sql.unsafe("SELECT demo_private.reset()"))).rejects.toThrow(
        "permission denied",
      );
      await expect(Promise.resolve(q`SELECT public.inventory_simulation_reset()`)).rejects.toThrow(
        "permission denied",
      );
    } finally {
      await db.sql.unsafe("RESET ROLE");
    }
  });

  test("visitor can create a stay, add a charge, simulate payment and check out", async () => {
    await db.sql.unsafe("SET ROLE authenticated");
    try {
      const [room] = await q`SELECT id FROM public.rooms ORDER BY sort_order DESC LIMIT 1`;
      const [result] = await q`SELECT public.create_stay_with_guest(
        'Test Fiction', ${room!.id}::uuid, CURRENT_DATE, CURRENT_DATE+1, 1,
        'walk_in'::public.stay_source, 100, '', 'confirmed', NULL, NULL, NULL) id`;
      const stay = String(result!.id);
      await q`INSERT INTO public.charges(stay_id, label, quantity, unit_price, created_by)
        VALUES (${stay}, 'Demo charge', 2, 25, ${visitor})`;
      await expect(Promise.resolve(q`SELECT public.checkout_stay(${stay}, false)`)).rejects.toThrow(
        "OVERRIDE_REQUIRED",
      );
      await q`INSERT INTO public.payments(stay_id, amount, method, received_by)
        VALUES (${stay}, 150, 'cash', ${visitor})`;
      const [payment] =
        await q`SELECT provider, notes FROM public.payments WHERE stay_id = ${stay}`;
      expect(payment!.provider).toBe("demo");
      expect(payment!.notes).toContain("SIMULATED PAYMENT");
      await q`SELECT public.checkout_stay(${stay}, false)`;
      expect((await q`SELECT status FROM public.stays WHERE id = ${stay}`)[0]!.status).toBe(
        "completed",
      );
    } finally {
      await db.sql.unsafe("RESET ROLE");
    }
  });

  test("provider payments are blocked even for a privileged backend", async () => {
    const [stay] = await q`SELECT id FROM public.stays LIMIT 1`;
    await expect(
      Promise.resolve(q`INSERT INTO public.payments(stay_id, amount, method, provider)
      VALUES (${stay!.id}, 100, 'paypal', 'paypal_live')`),
    ).rejects.toThrow("DEMO_PAYMENTS_DISABLED");
    await expect(
      Promise.resolve(q`INSERT INTO public.payment_sessions(stay_id, guest_token, amount_mad,
      charged_currency, charged_amount, fx_rate) VALUES (${stay!.id}, 'test', 100, 'EUR', 9.2, 0.092)`),
    ).rejects.toThrow("DEMO_SECURITY_LOCKED");
  });

  test("reset restores fictional current stays and removes visitor changes atomically", async () => {
    await db.sql.unsafe("SELECT demo_private.reset()");
    const [counts] = await q`SELECT (SELECT count(*)::int FROM public.guests) guests,
      (SELECT count(*)::int FROM public.stays) stays,
      (SELECT count(*)::int FROM public.guests WHERE email IS NOT NULL OR phone IS NOT NULL) contacts,
      (SELECT count(*)::int FROM public.stays WHERE check_in = CURRENT_DATE-1 AND check_out > CURRENT_DATE) current_stays,
      (SELECT count(*)::int FROM public.preview_food_orders) orders`;
    expect(counts).toMatchObject({ guests: 5, stays: 5, contacts: 0, current_stays: 5, orders: 0 });
    await db.sql.unsafe("SELECT demo_private.reset()");
    expect((await q`SELECT count(*)::int n FROM public.stays`)[0]!.n).toBe(5);
    expect((await q`SELECT count(*)::int n FROM auth.users`)[0]!.n).toBe(1);
  });

  test("anonymous access only exposes guest-token operations and bounded login quota", async () => {
    await actAs(db.sql, "");
    await db.sql.unsafe("SET ROLE anon");
    try {
      await expect(Promise.resolve(q`SELECT * FROM public.stays`)).rejects.toThrow(
        "permission denied",
      );
      await expect(
        Promise.resolve(q`SELECT public.set_user_role(${visitor}, 'admin')`),
      ).rejects.toThrow("permission denied");
      for (let i = 0; i < 120; i++) {
        expect((await q`SELECT public.demo_login_allowed() allowed`)[0]!.allowed).toBe(true);
      }
      expect((await q`SELECT public.demo_login_allowed() allowed`)[0]!.allowed).toBe(false);
    } finally {
      await db.sql.unsafe("RESET ROLE");
      await actAs(db.sql, visitor);
    }
  });
});
