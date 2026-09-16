-- DEMO ONLY. Add fixed Staff and Admin identities that reuse the existing hidden demo password.
-- Apply in a transaction after verifying the target project.
DO $$ BEGIN
  IF current_setting('caiat.demo_target', true) IS DISTINCT FROM 'llyihdkuplsyduxirvcg'
    OR to_regnamespace('demo_private') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = 'df101cea-e2ed-4a3a-956b-b817038bb648'::uuid
        AND email = 'public-demo@caiat.invalid'
        AND encrypted_password IS NOT NULL
    ) THEN
    RAISE EXCEPTION 'DEMO_TARGET_REQUIRED';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION demo_private.guard_auth_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT (
      (NEW.id = '6ffc1230-ee90-473d-b2fb-9c36736d37f2'::uuid
        AND NEW.email = 'public-demo-staff@caiat.invalid')
      OR (NEW.id = 'df101cea-e2ed-4a3a-956b-b817038bb648'::uuid
        AND NEW.email = 'public-demo@caiat.invalid')
      OR (NEW.id = '55672d38-529a-49c8-88a6-f604ad6096ca'::uuid
        AND NEW.email = 'public-demo-admin@caiat.invalid')
    ) THEN
      RAISE EXCEPTION 'DEMO_SECURITY_LOCKED';
    END IF;
    UPDATE demo_private.provisioning
      SET creation_transaction = txid_current() WHERE singleton;
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DEMO_SECURITY_LOCKED';
  ELSE
    IF EXISTS (
      SELECT 1 FROM demo_private.provisioning
      WHERE singleton AND creation_transaction = txid_current()
    ) THEN
      IF NEW.id IS DISTINCT FROM OLD.id OR NEW.email IS DISTINCT FROM OLD.email THEN
        RAISE EXCEPTION 'DEMO_SECURITY_LOCKED';
      END IF;
      RETURN NEW;
    END IF;
    IF (to_jsonb(NEW) - ARRAY['last_sign_in_at','updated_at','confirmed_at'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['last_sign_in_at','updated_at','confirmed_at']) THEN
      RAISE EXCEPTION 'DEMO_SECURITY_LOCKED';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION demo_private.provision_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE demo_role public.app_role;
DECLARE demo_username text;
DECLARE demo_name text;
BEGIN
  SELECT x.role, x.username, x.full_name
    INTO demo_role, demo_username, demo_name
  FROM (VALUES
    ('6ffc1230-ee90-473d-b2fb-9c36736d37f2'::uuid, 'staff'::public.app_role,
      'public-demo-staff', 'Demo staff'),
    ('df101cea-e2ed-4a3a-956b-b817038bb648'::uuid, 'supervisor'::public.app_role,
      'public-demo-supervisor', 'Demo supervisor'),
    ('55672d38-529a-49c8-88a6-f604ad6096ca'::uuid, 'admin'::public.app_role,
      'public-demo-admin', 'Demo admin')
  ) AS x(id, role, username, full_name)
  WHERE x.id = NEW.id;

  IF demo_role IS NULL THEN RAISE EXCEPTION 'DEMO_SECURITY_LOCKED'; END IF;
  INSERT INTO public.profiles(id, username, full_name)
    VALUES (NEW.id, demo_username, demo_name);
  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, demo_role);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION demo_private.guard_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.provider = 'email'
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = NEW.user_id
        AND raw_app_meta_data ->> 'caiat_demo' = 'true'
        AND (id, email) IN (
          ('6ffc1230-ee90-473d-b2fb-9c36736d37f2'::uuid, 'public-demo-staff@caiat.invalid'),
          ('df101cea-e2ed-4a3a-956b-b817038bb648'::uuid, 'public-demo@caiat.invalid'),
          ('55672d38-529a-49c8-88a6-f604ad6096ca'::uuid, 'public-demo-admin@caiat.invalid')
        )
    ) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND
    (to_jsonb(NEW) - ARRAY['last_sign_in_at','updated_at','email']) =
    (to_jsonb(OLD) - ARRAY['last_sign_in_at','updated_at','email']) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'DEMO_SECURITY_LOCKED';
END $$;

-- The password hash stays inside Auth and is copied without exposing the password.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  invited_at, confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at,
  email_change_token_new, email_change, email_change_sent_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at,
  phone, phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at,
  email_change_token_current, email_change_confirm_status, banned_until,
  reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous
)
SELECT
  u.instance_id, x.id, u.aud, u.role, x.email, u.encrypted_password, now(),
  NULL, '', NULL, '', NULL, '', '', NULL, NULL,
  jsonb_build_object('provider','email','providers',jsonb_build_array('email'),'caiat_demo',true),
  jsonb_build_object('email_verified',true), false, now(), now(),
  NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false
FROM auth.users u
CROSS JOIN (VALUES
  ('6ffc1230-ee90-473d-b2fb-9c36736d37f2'::uuid, 'public-demo-staff@caiat.invalid'),
  ('55672d38-529a-49c8-88a6-f604ad6096ca'::uuid, 'public-demo-admin@caiat.invalid')
) AS x(id, email)
WHERE u.id = 'df101cea-e2ed-4a3a-956b-b817038bb648'::uuid
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
SELECT
  x.id::text, x.id,
  jsonb_build_object('sub',x.id::text,'email',x.email,'email_verified',false,'phone_verified',false),
  'email', NULL, now(), now()
FROM (VALUES
  ('6ffc1230-ee90-473d-b2fb-9c36736d37f2'::uuid, 'public-demo-staff@caiat.invalid'),
  ('55672d38-529a-49c8-88a6-f604ad6096ca'::uuid, 'public-demo-admin@caiat.invalid')
) AS x(id, email)
ON CONFLICT (provider_id, provider) DO NOTHING;

UPDATE public.profiles
SET username = 'public-demo-supervisor', full_name = 'Demo supervisor'
WHERE id = 'df101cea-e2ed-4a3a-956b-b817038bb648'::uuid;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.user_roles r ON r.user_id = p.id
      WHERE p.id = _user_id
        AND p.active
        AND p.username LIKE 'public-demo-%'
        AND r.role = _role
    )
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN public.has_role(_user_id, 'admin'::public.app_role) THEN
      _key IN ('reservations_manage','payments_manage','checkout_override','cash_reconcile',
        'customers_manage','guest_access_manage','requests_manage','activity_view',
        'users_manage','roles_manage','pin_reset')
    WHEN public.has_role(_user_id, 'supervisor'::public.app_role) THEN
      _key IN ('reservations_manage','payments_manage','checkout_override','cash_reconcile',
        'customers_manage','guest_access_manage','requests_manage','activity_view')
    WHEN public.has_role(_user_id, 'staff'::public.app_role) THEN
      _key IN ('payments_manage','requests_manage')
    ELSE false
  END
$$;

-- Admin screens are visible, while persistent configuration and security writes stay locked.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.profiles, public.user_roles, public.user_permissions,
     public.rooms, public.service_types, public.service_recommendations
  FROM authenticated;
REVOKE ALL ON public.payment_sessions FROM authenticated;

