-- Test-only stand-ins for the objects Supabase manages outside `supabase/migrations`.
--
-- The repository's migrations assume a Supabase database: the `auth` schema,
-- the `anon` / `authenticated` / `service_role` roles, the `extensions` schema
-- and the `supabase_realtime` publication all exist before the first migration
-- runs. A plain PostgreSQL instance has none of them, so this prelude creates
-- the minimum needed for the migrations to apply unchanged.
--
-- Nothing here is production code and nothing here is asserted on. It only has
-- to be faithful enough that the real migrations run; the behaviour under test
-- is the SQL in `supabase/migrations`.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;

GRANT anon, authenticated, service_role TO CURRENT_USER;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Stand-in for Supabase's auth.uid(): reads the signed-in user from a session
-- setting so tests can act as a specific staff member.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
$$;

GRANT USAGE ON SCHEMA auth, extensions, public TO anon, authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- Demo-seed migrations insert rows that reference these fixed staff accounts.
INSERT INTO auth.users (id, email) VALUES
  ('9e73e824-cdcd-45e9-900a-3f9028f1d513', 'seed-admin@example.test'),
  ('78d4551a-afd2-4cc9-85e4-600348c7a5c7', 'seed-youssef@example.test'),
  ('e57082f0-3283-4a6a-a619-bce148207868', 'seed-fatima@example.test')
ON CONFLICT (id) DO NOTHING;
