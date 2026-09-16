import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  actAs,
  createTestDatabase,
  databaseAvailable,
  type TestDatabase,
} from "./support/preview-db";

const install = await readFile(new URL("../scripts/demo/install.sql", import.meta.url), "utf8");
const quotaV2 = await readFile(
  new URL("../scripts/demo/login-quota-v2.sql", import.meta.url),
  "utf8",
);
const quotaFinalize = await readFile(
  new URL("../scripts/demo/login-quota-finalize.sql", import.meta.url),
  "utf8",
);
const roleSelector = await readFile(
  new URL("../scripts/demo/role-selector.sql", import.meta.url),
  "utf8",
);
const quotaSecret = "a".repeat(64); // Disposable test fixture, never a deployed secret.
const run = databaseAvailable() ? describe : describe.skip;
run("isolated public demo database", () => {
  let db: TestDatabase;
  let visitor: string;
  let staff: string;
  let admin: string;
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
    ALTER TABLE auth.users
      ADD COLUMN instance_id uuid, ADD COLUMN aud text, ADD COLUMN role text,
      ADD COLUMN raw_app_meta_data jsonb DEFAULT '{}',
      ADD COLUMN encrypted_password text, ADD COLUMN invited_at timestamptz,
      ADD COLUMN confirmation_token text, ADD COLUMN confirmation_sent_at timestamptz,
      ADD COLUMN recovery_token text, ADD COLUMN recovery_sent_at timestamptz,
      ADD COLUMN email_change_token_new text, ADD COLUMN email_change text,
      ADD COLUMN email_change_sent_at timestamptz, ADD COLUMN last_sign_in_at timestamptz,
      ADD COLUMN updated_at timestamptz,
      ADD COLUMN email_confirmed_at timestamptz, ADD COLUMN phone text,
      ADD COLUMN phone_confirmed_at timestamptz, ADD COLUMN phone_change text,
      ADD COLUMN phone_change_token text, ADD COLUMN phone_change_sent_at timestamptz,
      ADD COLUMN email_change_token_current text, ADD COLUMN email_change_confirm_status smallint,
      ADD COLUMN banned_until timestamptz, ADD COLUMN reauthentication_token text,
      ADD COLUMN reauthentication_sent_at timestamptz, ADD COLUMN is_super_admin boolean,
      ADD COLUMN is_sso_user boolean, ADD COLUMN deleted_at timestamptz,
      ADD COLUMN is_anonymous boolean,
      ADD COLUMN confirmed_at timestamptz GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED;
    CREATE TABLE auth.identities(id uuid DEFAULT gen_random_uuid(), provider_id text,
      user_id uuid REFERENCES auth.users, identity_data jsonb, provider text,
      email text GENERATED ALWAYS AS (lower(identity_data ->> 'email')) STORED,
      last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz,
      UNIQUE(provider_id, provider));
    CREATE TABLE auth.mfa_factors(id uuid DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users);
    `);
    await expect(Promise.resolve(db.sql.unsafe(install))).rejects.toThrow("DEMO_TARGET_REQUIRED");
    await q`SELECT set_config('caiat.demo_target', 'llyihdkuplsyduxirvcg', false)`;
    await db.sql.unsafe(`BEGIN; ${install} COMMIT;`);
    await db.sql.unsafe(`BEGIN; ${quotaV2} COMMIT;`);
    await q`INSERT INTO demo_private.login_rate_config(secret_hash)
      VALUES (encode(sha256(convert_to(${quotaSecret}, 'UTF8')), 'hex'))`;
    await db.sql.unsafe(`BEGIN; ${quotaFinalize} COMMIT;`);
    staff = "6ffc1230-ee90-473d-b2fb-9c36736d37f2";
    visitor = "df101cea-e2ed-4a3a-956b-b817038bb648";
    admin = "55672d38-529a-49c8-88a6-f604ad6096ca";
    await db.sql.unsafe("BEGIN");
    await q`INSERT INTO auth.users(id, email, encrypted_password)
      VALUES (${visitor}, 'public-demo@caiat.invalid', 'test-only')`;
    // Mirror Auth Admin API's post-insert updates within the creation transaction.
    await q`UPDATE auth.users SET email_confirmed_at = now(), raw_app_meta_data = '{"caiat_demo":true}' WHERE id = ${visitor}`;
    await db.sql.unsafe("COMMIT");
    await q`INSERT INTO auth.identities(provider_id, user_id, provider, identity_data)
      VALUES (${visitor}, ${visitor}, 'email', '{"email":"public-demo@caiat.invalid"}')`;
    await db.sql.unsafe(`BEGIN; ${roleSelector} COMMIT;`);
    await actAs(db.sql, visitor);
  }, 60_000);
  afterAll(async () => {
    if (db) await db.drop();
  });

  test("three fixed role accounts, no browser registration or credential/MFA changes", async () => {
    const roles = await q`SELECT user_id id, role FROM public.user_roles
      WHERE user_id IN (${staff}, ${visitor}, ${admin}) ORDER BY role`;
    expect(roles).toEqual([
      { id: admin, role: "admin" },
      { id: staff, role: "staff" },
      { id: visitor, role: "supervisor" },
    ]);
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
    await q`UPDATE auth.identities SET last_sign_in_at = now() WHERE user_id = ${visitor}`;
    await expect(
      Promise.resolve(
        q`UPDATE auth.identities SET identity_data = '{"email":"changed@example.test"}' WHERE user_id = ${visitor}`,
      ),
    ).rejects.toThrow("DEMO_SECURITY_LOCKED");
    await q`UPDATE auth.users SET last_sign_in_at = now(), updated_at = now() WHERE id = ${visitor}`;
  });

  test("each identity receives its fixed role and permission set", async () => {
    await actAs(db.sql, staff);
    expect((await q`SELECT public.has_role(${staff}, 'staff') allowed`)[0]!.allowed).toBe(true);
    expect(
      (await q`SELECT public.has_permission(${staff}, 'payments_manage') allowed`)[0]!.allowed,
    ).toBe(true);
    expect(
      (await q`SELECT public.has_permission(${staff}, 'reservations_manage') allowed`)[0]!.allowed,
    ).toBe(false);

    await actAs(db.sql, visitor);
    expect(
      (await q`SELECT public.has_permission(${visitor}, 'activity_view') allowed`)[0]!.allowed,
    ).toBe(true);
    expect(
      (await q`SELECT public.has_permission(${visitor}, 'users_manage') allowed`)[0]!.allowed,
    ).toBe(false);

    await actAs(db.sql, admin);
    expect((await q`SELECT public.has_role(${admin}, 'admin') allowed`)[0]!.allowed).toBe(true);
    expect(
      (await q`SELECT public.has_permission(${admin}, 'users_manage') allowed`)[0]!.allowed,
    ).toBe(true);
    await actAs(db.sql, visitor);
  });

  test("finance RPC is available to demo managers but denied to demo staff", async () => {
    try {
      await db.sql.unsafe("SET ROLE authenticated");
      for (const user of [visitor, admin]) {
        await actAs(db.sql, user);
        const [report] = await db.sql`SELECT public.finance_profitability(true) AS report`;
        expect(Array.isArray((report as { report: { dishes: unknown[] } }).report.dishes)).toBe(
          true,
        );
      }
      await actAs(db.sql, staff);
      await expect(Promise.resolve(db.sql`SELECT public.finance_profitability()`)).rejects.toThrow(
        "PERMISSION_DENIED",
      );
    } finally {
      await db.sql.unsafe("RESET ROLE");
      await actAs(db.sql, visitor);
    }
  });

  test("stock RPCs are executable but still enforce the caller's demo role", async () => {
    const [grants] = await q`SELECT bool_and(
      has_function_privilege('authenticated', signature, 'EXECUTE')
    ) allowed
    FROM unnest(ARRAY[
      'public.inventory_receive(uuid,numeric,numeric,text)',
      'public.inventory_adjust(uuid,numeric,text)',
      'public.inventory_waste(uuid,numeric,text)',
      'public.inventory_record_purchase(uuid,uuid,timestamptz,text,jsonb)',
      'public.inventory_simulate_week(uuid,text)',
      'public.inventory_simulate_purchase(uuid)',
      'public.inventory_simulation_reset()',
      'public.inventory_simulate_history(uuid,integer)'
    ]) signature`;
    expect(grants!.allowed).toBe(true);

    await actAs(db.sql, visitor);
    await db.sql.unsafe("SET ROLE authenticated");
    try {
      await expect(
        Promise.resolve(q`SELECT public.inventory_simulate_week(gen_random_uuid(), 'quiet')`),
      ).rejects.toThrow("PERMISSION_DENIED");
    } finally {
      await db.sql.unsafe("RESET ROLE");
    }

    await actAs(db.sql, admin);
    await db.sql.unsafe("SET ROLE authenticated");
    try {
      const [item] = await q`SELECT i.id,
        (coalesce(sum(m.quantity), 0) + 1)::int n
        FROM public.inventory_items i
        LEFT JOIN public.inventory_movements m ON m.inventory_item_id = i.id
        WHERE i.active
        GROUP BY i.id
        ORDER BY i.id
        LIMIT 1`;
      await q`SELECT public.inventory_adjust(${item!.id}::uuid, ${item!.n}, 'Demo permission test')`;
      await q`SELECT public.inventory_simulate_week(gen_random_uuid(), 'quiet')`;
    } finally {
      await db.sql.unsafe("RESET ROLE");
      await actAs(db.sql, visitor);
    }
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
        "PERMISSION_DENIED",
      );
    } finally {
      await db.sql.unsafe("RESET ROLE");
    }
  });

  test("visitor can create a stay, add a charge, simulate payment and check out", async () => {
    await actAs(db.sql, visitor);
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
    expect(counts).toMatchObject({
      guests: 5,
      stays: 5,
      contacts: 0,
      current_stays: 5,
      orders: 0,
    });
    await db.sql.unsafe("SELECT demo_private.reset()");
    expect((await q`SELECT count(*)::int n FROM public.stays`)[0]!.n).toBe(5);
    expect((await q`SELECT count(*)::int n FROM auth.users`)[0]!.n).toBe(3);
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
      await expect(Promise.resolve(q`SELECT public.demo_login_allowed()`)).rejects.toThrow(
        "permission denied",
      );
      await expect(
        Promise.resolve(q`SELECT * FROM demo_private.login_rate_config`),
      ).rejects.toThrow("permission denied");
      for (let i = 0; i < 25; i++) {
        await expect(
          Promise.resolve(
            q`SELECT public.demo_login_allowed_v2(${"b".repeat(64)}, ${"1".repeat(64)})`,
          ),
        ).rejects.toThrow("DEMO_QUOTA_UNAUTHORIZED");
      }
      for (let i = 0; i < 20; i++) {
        expect(
          (
            await q`SELECT public.demo_login_allowed_v2(${quotaSecret}, ${"1".repeat(64)}) allowed`
          )[0]!.allowed,
        ).toBe(true);
      }
      expect(
        (
          await q`SELECT public.demo_login_allowed_v2(${quotaSecret}, ${"1".repeat(64)}) allowed`
        )[0]!.allowed,
      ).toBe(false);
      expect(
        (
          await q`SELECT public.demo_login_allowed_v2(${quotaSecret}, ${"2".repeat(64)}) allowed`
        )[0]!.allowed,
      ).toBe(true);
    } finally {
      await db.sql.unsafe("RESET ROLE");
      await actAs(db.sql, visitor);
    }
  });
  test("quota increments are atomic and an expired address gets a fresh window", async () => {
    const bucket = "3".repeat(64);
    const connections = Array.from({ length: 4 }, () => db.connect());
    try {
      await Promise.all(connections.map((sql) => sql.unsafe("SET ROLE anon")));
      const groups = await Promise.all(
        connections.map(async (sql) => {
          let accepted = 0;
          for (let i = 0; i < 10; i++) {
            const rows =
              (await sql`SELECT public.demo_login_allowed_v2(${quotaSecret}, ${bucket}) allowed`) as Row[];
            if (rows[0]!.allowed) accepted++;
          }
          return accepted;
        }),
      );
      expect(groups.reduce((a, b) => a + b, 0)).toBe(20);
    } finally {
      await Promise.all(connections.map((sql) => sql.end()));
    }
    await q`UPDATE demo_private.login_rate_buckets SET window_start = now() - interval '2 hours' WHERE bucket = ${bucket}`;
    expect(
      (await q`SELECT public.demo_login_allowed_v2(${quotaSecret}, ${bucket}) allowed`)[0]!.allowed,
    ).toBe(true);
    await q`UPDATE demo_private.login_rate_buckets SET window_start = now() - interval '2 days' WHERE bucket = ${bucket}`;
    await q`SELECT public.demo_login_allowed_v2(${quotaSecret}, ${"4".repeat(64)})`;
    expect(
      (
        await q`SELECT count(*)::int n FROM demo_private.login_rate_buckets WHERE bucket = ${bucket}`
      )[0]!.n,
    ).toBe(0);
  });
});
