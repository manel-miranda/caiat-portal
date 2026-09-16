-- DEMO ONLY. Deliberately outside supabase/migrations: never run on production.
-- The runner must validate its target URL, then set caiat.demo_target in this transaction.
DO $$
BEGIN
  IF current_setting('caiat.demo_target', true) IS DISTINCT FROM 'llyihdkuplsyduxirvcg' THEN
    RAISE EXCEPTION 'DEMO_TARGET_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users) THEN
    RAISE EXCEPTION 'DEMO_INSTALL_REQUIRES_EMPTY_AUTH';
  END IF;
END $$;

CREATE SCHEMA demo_private;
REVOKE ALL ON SCHEMA demo_private FROM PUBLIC, anon, authenticated, service_role;

-- Fail closed: only reviewed operational RPCs are exposed in this demo database.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.profiles, public.user_roles, public.user_permissions,
     public.rooms, public.service_types, public.service_recommendations
  FROM authenticated;
REVOKE ALL ON public.payment_sessions FROM authenticated;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.user_roles r ON r.user_id = p.id
      WHERE p.id = _user_id AND p.active AND p.username LIKE 'public-demo-%' AND r.role = _role
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

DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
      'has_role', 'has_permission', 'finance_profitability', 'create_stay_with_guest', 'edit_stay',
      'confirm_reservation', 'reject_reservation', 'checkout_stay',
      'customer_upsert', 'customer_update_profile', 'merge_customers',
      'complete_request', 'cancel_request', 'cash_reconcile',
      'guest_token_generate', 'guest_token_revoke',
      'staff_create_food_order', 'preview_food_order_set_status',
      'inventory_receive', 'inventory_adjust', 'inventory_waste',
      'inventory_record_purchase', 'inventory_simulate_week',
      'inventory_simulate_purchase', 'inventory_simulation_reset',
      'inventory_simulate_history'
    ])
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.signature);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
      'guest_portal', 'guest_create_request', 'guest_create_preview_food_order'
    ])
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f.signature);
  END LOOP;
END $$;

-- Public signup cannot choose a user ID; only Auth Admin API can provision this fixed identity.
-- Supabase sets role, metadata and confirmation AFTER insertion in the same transaction.
-- Remember only that insertion's transaction ID, never an ID inferred from later row updates.
CREATE TABLE demo_private.provisioning (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  creation_transaction bigint
);
ALTER TABLE demo_private.provisioning ENABLE ROW LEVEL SECURITY;
INSERT INTO demo_private.provisioning VALUES (true, NULL);
CREATE FUNCTION demo_private.guard_auth_user() RETURNS trigger
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
    UPDATE demo_private.provisioning SET creation_transaction = txid_current() WHERE singleton;
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DEMO_SECURITY_LOCKED';
  ELSE
    IF EXISTS (SELECT 1 FROM demo_private.provisioning
      WHERE singleton AND creation_transaction = txid_current()) THEN
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
CREATE TRIGGER caiat_demo_auth_guard BEFORE INSERT OR UPDATE OR DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION demo_private.guard_auth_user();

CREATE FUNCTION demo_private.provision_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE demo_role public.app_role;
DECLARE demo_username text;
DECLARE demo_name text;
BEGIN
  SELECT x.role, x.username, x.full_name INTO demo_role, demo_username, demo_name
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
  INSERT INTO public.profiles(id, username, full_name) VALUES (NEW.id, demo_username, demo_name);
  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, demo_role);
  RETURN NEW;
END $$;
CREATE TRIGGER caiat_demo_profile AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION demo_private.provision_profile();

CREATE FUNCTION demo_private.lock_security() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'DEMO_SECURITY_LOCKED';
END $$;
-- Prevent MFA enrollment and identity linking through the Auth API too.
CREATE FUNCTION demo_private.guard_identity() RETURNS trigger
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
CREATE TRIGGER caiat_demo_identity_guard BEFORE INSERT OR UPDATE OR DELETE ON auth.identities
  FOR EACH ROW EXECUTE FUNCTION demo_private.guard_identity();
CREATE TRIGGER caiat_demo_mfa_guard BEFORE INSERT OR UPDATE OR DELETE ON auth.mfa_factors
  FOR EACH ROW EXECUTE FUNCTION demo_private.lock_security();

-- Even privileged payment paths cannot create a provider payment in this database.
CREATE TRIGGER caiat_demo_no_online_payment BEFORE INSERT OR UPDATE ON public.payment_sessions
  FOR EACH ROW EXECUTE FUNCTION demo_private.lock_security();
CREATE FUNCTION demo_private.mark_payment() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.method::text = 'paypal' OR NEW.external_reference IS NOT NULL
    OR (NEW.provider IS NOT NULL AND NEW.provider <> 'demo') THEN
    RAISE EXCEPTION 'DEMO_PAYMENTS_DISABLED';
  END IF;
  NEW.provider := 'demo';
  NEW.notes := 'SIMULATED PAYMENT — no money collected';
  RETURN NEW;
END $$;
CREATE TRIGGER caiat_demo_payment BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION demo_private.mark_payment();

CREATE TABLE demo_private.login_quota (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL
);
ALTER TABLE demo_private.login_quota ENABLE ROW LEVEL SECURITY;
INSERT INTO demo_private.login_quota VALUES (true, now(), 0);
CREATE FUNCTION public.demo_login_allowed() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE accepted boolean;
BEGIN
  UPDATE demo_private.login_quota
    SET attempts = CASE WHEN window_start < now() - interval '1 hour' THEN 1 ELSE attempts + 1 END,
        window_start = CASE WHEN window_start < now() - interval '1 hour' THEN now() ELSE window_start END
    WHERE singleton AND (attempts < 120 OR window_start < now() - interval '1 hour')
    RETURNING true INTO accepted;
  RETURN coalesce(accepted, false);
END $$;
REVOKE ALL ON FUNCTION public.demo_login_allowed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.demo_login_allowed() TO anon;

-- One transaction: either a full fresh scenario is visible, or the old one survives.
-- No CASCADE: new foreign-key dependencies must be reviewed before this reset can run.
CREATE FUNCTION demo_private.reset() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE r record; g uuid; s uuid; i integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(627318491);
  TRUNCATE public.audit_log, public.cash_reconciliations,
    public.guest_catalog_events, public.guest_access_tokens, public.payment_sessions,
    public.payments, public.preview_food_order_items, public.preview_food_orders,
    public.requests, public.charges, public.stays, public.guests,
    public.inventory_movements, public.purchase_lines, public.purchases,
    public.inventory_simulation_runs;

  FOR r IN SELECT id FROM public.rooms WHERE active ORDER BY sort_order, number LIMIT 5 LOOP
    i := i + 1;
    INSERT INTO public.guests(full_name, notes)
      VALUES ((ARRAY['Alex Demo','Sam Example','Robin Sample','Charlie Fiction','Taylor Explorer'])[i],
        'Fictional demo guest') RETURNING id INTO g;
    INSERT INTO public.stays(guest_id, room_id, check_in, check_out, num_guests, source,
      accommodation_total, confirmation_status, notes)
      VALUES (g, r.id, CURRENT_DATE - 1, CURRENT_DATE + i, 1, 'walk_in',
        650 * (i + 1), CASE WHEN i = 5 THEN 'pending' ELSE 'confirmed' END,
        'Fictional stay — explore charges, simulated payments and checkout') RETURNING id INTO s;
    IF i < 5 THEN
      INSERT INTO public.charges(stay_id, label, quantity, unit_price)
        VALUES (s, 'Demo breakfast', 1, 80);
      INSERT INTO public.payments(stay_id, amount, method)
        VALUES (s, CASE WHEN i = 1 THEN 650 * (i + 1) + 80 ELSE 500 END, 'cash');
      INSERT INTO public.requests(stay_id, room_id, label, scheduled_at)
        VALUES (s, r.id, 'Demo housekeeping', now() + interval '1 hour');
    END IF;
  END LOOP;
  INSERT INTO public.inventory_movements(inventory_item_id, movement_type, quantity, source_type, notes)
    SELECT id, 'receipt', greatest(safety_stock * 3, 10), 'demo_reset', 'Fictional opening stock'
      FROM public.inventory_items WHERE active;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA demo_private FROM PUBLIC, anon, authenticated, service_role;
SELECT demo_private.reset();
