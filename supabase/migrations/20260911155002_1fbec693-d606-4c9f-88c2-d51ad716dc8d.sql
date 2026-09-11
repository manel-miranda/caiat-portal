-- ============ permissions ============
CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission text NOT NULL,
  granted boolean NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission)
);

GRANT SELECT ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permissions readable by authenticated"
  ON public.user_permissions FOR SELECT TO authenticated USING (true);

-- Defaults per role. Security-sensitive keys are never listed here: they are
-- resolved by role only, inside has_permission.
CREATE OR REPLACE FUNCTION public.role_default_permission(_role app_role, _key text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _role = 'admin' THEN true
    WHEN _role = 'supervisor' THEN _key IN (
      'reservations_manage','payments_manage','checkout_override','cash_reconcile',
      'customers_manage','guest_access_manage','requests_manage','activity_view')
    ELSE _key IN ('payments_manage','requests_manage')
  END
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_active boolean;
  v_admin boolean;
  v_role app_role;
  v_override boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;

  SELECT p.active INTO v_active FROM public.profiles p WHERE p.id = _user_id;
  IF coalesce(v_active, false) = false THEN RETURN false; END IF;

  v_admin := public.has_role(_user_id, 'admin');

  -- Security-sensitive capabilities are admin-only and not grantable.
  IF _key IN ('users_manage','roles_manage','pin_reset') THEN
    RETURN v_admin;
  END IF;
  IF v_admin THEN RETURN true; END IF;

  SELECT up.granted INTO v_override
    FROM public.user_permissions up
   WHERE up.user_id = _user_id AND up.permission = _key;
  IF v_override IS NOT NULL THEN RETURN v_override; END IF;

  SELECT ur.role INTO v_role
    FROM public.user_roles ur
   WHERE ur.user_id = _user_id
   ORDER BY CASE ur.role WHEN 'admin' THEN 0 WHEN 'supervisor' THEN 1 ELSE 2 END
   LIMIT 1;

  RETURN public.role_default_permission(coalesce(v_role, 'staff'::app_role), _key);
END;
$$;

REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.role_default_permission(app_role, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.role_default_permission(app_role, text) TO authenticated, service_role;

CREATE TRIGGER user_permissions_updated_at
BEFORE UPDATE ON public.user_permissions
FOR EACH ROW EXECUTE FUNCTION public.payment_sessions_touch();

-- ============ admin user management RPCs ============
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_was app_role;
  v_admins integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  SELECT ur.role INTO v_was FROM public.user_roles ur WHERE ur.user_id = p_user_id
   ORDER BY CASE ur.role WHEN 'admin' THEN 0 WHEN 'supervisor' THEN 1 ELSE 2 END LIMIT 1;

  IF v_was = 'admin' AND p_role <> 'admin' THEN
    SELECT count(*) INTO v_admins FROM public.user_roles WHERE role = 'admin';
    IF v_admins <= 1 THEN RAISE EXCEPTION 'LAST_ADMIN'; END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, p_role);

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'user.role_changed', 'user', p_user_id,
          jsonb_build_object('from', v_was, 'to', p_role));
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_permission(p_user_id uuid, p_key text, p_granted boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF p_key NOT IN (
    'reservations_manage','payments_manage','checkout_override','cash_reconcile',
    'customers_manage','guest_access_manage','requests_manage','activity_view'
  ) THEN
    RAISE EXCEPTION 'PERMISSION_NOT_GRANTABLE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  IF p_granted IS NULL THEN
    DELETE FROM public.user_permissions WHERE user_id = p_user_id AND permission = p_key;
  ELSE
    INSERT INTO public.user_permissions (user_id, permission, granted, updated_by)
    VALUES (p_user_id, p_key, p_granted, auth.uid())
    ON CONFLICT (user_id, permission)
    DO UPDATE SET granted = excluded.granted, updated_by = excluded.updated_by, updated_at = now();
  END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'user.permission_changed', 'user', p_user_id,
          jsonb_build_object('permission', p_key, 'granted', p_granted));
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_active(p_user_id uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admins integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  IF p_active = false THEN
    IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'CANNOT_DEACTIVATE_SELF'; END IF;
    SELECT count(*) INTO v_admins
      FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
     WHERE ur.role = 'admin' AND p.active AND ur.user_id <> p_user_id;
    IF v_admins < 1 THEN RAISE EXCEPTION 'LAST_ADMIN'; END IF;
  END IF;

  UPDATE public.profiles SET active = p_active WHERE id = p_user_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), CASE WHEN p_active THEN 'user.activated' ELSE 'user.deactivated' END,
          'user', p_user_id, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_user_permission(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_user_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_user_permission(uuid, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_user_active(uuid, boolean) TO authenticated, service_role;

-- ============ customers (reusing guests) ============
CREATE INDEX IF NOT EXISTS guests_full_name_lower_idx ON public.guests (lower(full_name));
CREATE INDEX IF NOT EXISTS guests_phone_idx ON public.guests (phone);
CREATE INDEX IF NOT EXISTS guests_email_lower_idx ON public.guests (lower(email));

-- Direct writes on guests move behind a permission-checked RPC; reads stay open
-- to any signed-in staff member. Anonymous access is unchanged (none).
DROP POLICY IF EXISTS "guests all authenticated" ON public.guests;
CREATE POLICY "guests readable by authenticated"
  ON public.guests FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.customer_upsert(
  p_full_name text, p_phone text, p_email text, p_nationality text, p_notes text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF coalesce(btrim(p_full_name), '') = '' THEN RAISE EXCEPTION 'GUEST_NAME_REQUIRED'; END IF;

  INSERT INTO public.guests (full_name, phone, email, nationality, notes)
  VALUES (btrim(p_full_name),
          nullif(btrim(coalesce(p_phone, '')), ''),
          nullif(btrim(coalesce(p_email, '')), ''),
          nullif(btrim(coalesce(p_nationality, '')), ''),
          nullif(btrim(coalesce(p_notes, '')), ''))
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'customer.created', 'guest', v_id,
          jsonb_build_object('full_name', btrim(p_full_name)));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_update_profile(
  p_guest_id uuid, p_full_name text, p_phone text, p_email text, p_nationality text, p_notes text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_before jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'customers_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED:customers_manage';
  END IF;
  IF coalesce(btrim(p_full_name), '') = '' THEN RAISE EXCEPTION 'GUEST_NAME_REQUIRED'; END IF;

  SELECT to_jsonb(g) - 'id' - 'created_at' INTO v_before FROM public.guests g WHERE g.id = p_guest_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;

  UPDATE public.guests
     SET full_name = btrim(p_full_name),
         phone = nullif(btrim(coalesce(p_phone, '')), ''),
         email = nullif(btrim(coalesce(p_email, '')), ''),
         nationality = nullif(btrim(coalesce(p_nationality, '')), ''),
         notes = nullif(btrim(coalesce(p_notes, '')), '')
   WHERE id = p_guest_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'customer.updated', 'guest', p_guest_id, jsonb_build_object('before', v_before));
  RETURN p_guest_id;
END;
$$;

REVOKE ALL ON FUNCTION public.customer_upsert(text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.customer_update_profile(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_upsert(text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_update_profile(uuid, text, text, text, text, text) TO authenticated, service_role;

-- ============ stay creation can reuse an existing customer ============
DROP FUNCTION IF EXISTS public.create_stay_with_guest(text, uuid, date, date, integer, stay_source, numeric, text, text);

CREATE OR REPLACE FUNCTION public.create_stay_with_guest(
  p_guest_name text, p_room_id uuid, p_check_in date, p_check_out date,
  p_num_guests integer, p_source stay_source, p_accommodation_total numeric,
  p_notes text, p_confirmation_status text DEFAULT 'confirmed'::text,
  p_guest_id uuid DEFAULT NULL, p_phone text DEFAULT NULL, p_email text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_guest_id uuid;
  v_stay_id uuid;
  v_conflict record;
  v_capacity integer;
  v_conf text := coalesce(p_confirmation_status, 'confirmed');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF v_conf NOT IN ('pending','confirmed') THEN RAISE EXCEPTION 'INVALID_CONFIRMATION_STATUS'; END IF;
  IF p_guest_id IS NULL AND coalesce(btrim(p_guest_name), '') = '' THEN
    RAISE EXCEPTION 'GUEST_NAME_REQUIRED';
  END IF;
  IF p_room_id IS NULL THEN RAISE EXCEPTION 'ROOM_REQUIRED'; END IF;
  IF p_check_out <= p_check_in THEN RAISE EXCEPTION 'CHECKOUT_AFTER_CHECKIN'; END IF;
  IF coalesce(p_num_guests, 0) < 1 THEN RAISE EXCEPTION 'GUESTS_MIN_ONE'; END IF;
  IF coalesce(p_accommodation_total, 0) < 0 THEN RAISE EXCEPTION 'TOTAL_NON_NEGATIVE'; END IF;

  SELECT r.capacity INTO v_capacity FROM public.rooms r WHERE r.id = p_room_id;
  IF v_capacity IS NULL THEN RAISE EXCEPTION 'ROOM_REQUIRED'; END IF;
  IF p_num_guests > v_capacity THEN RAISE EXCEPTION 'ROOM_CAPACITY:%', v_capacity; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_room_id::text, 0));

  IF v_conf = 'confirmed' THEN
    SELECT s.id, s.check_in, s.check_out INTO v_conflict
    FROM public.stays s
    WHERE s.room_id = p_room_id
      AND s.status <> 'cancelled'
      AND s.confirmation_status = 'confirmed'
      AND s.check_in < p_check_out
      AND s.check_out > p_check_in
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'ROOM_CONFLICT:%:%', v_conflict.check_in, v_conflict.check_out;
    END IF;
  END IF;

  -- Returning customer: link to the exact existing row, never duplicate it.
  IF p_guest_id IS NOT NULL THEN
    SELECT g.id INTO v_guest_id FROM public.guests g WHERE g.id = p_guest_id;
    IF v_guest_id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
  ELSE
    INSERT INTO public.guests (full_name, phone, email)
    VALUES (btrim(p_guest_name),
            nullif(btrim(coalesce(p_phone, '')), ''),
            nullif(btrim(coalesce(p_email, '')), ''))
    RETURNING id INTO v_guest_id;
  END IF;

  INSERT INTO public.stays (
    guest_id, room_id, check_in, check_out, num_guests, source,
    accommodation_total, notes, created_by, confirmation_status,
    confirmed_by, confirmed_at
  ) VALUES (
    v_guest_id, p_room_id, p_check_in, p_check_out, p_num_guests, p_source,
    coalesce(p_accommodation_total, 0), nullif(btrim(coalesce(p_notes, '')), ''), auth.uid(), v_conf,
    CASE WHEN v_conf = 'confirmed' THEN auth.uid() END,
    CASE WHEN v_conf = 'confirmed' THEN now() END
  ) RETURNING id INTO v_stay_id;

  RETURN v_stay_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_stay_with_guest(text, uuid, date, date, integer, stay_source, numeric, text, text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stay_with_guest(text, uuid, date, date, integer, stay_source, numeric, text, text, uuid, text, text) TO authenticated, service_role;

-- ============ existing RPCs move from admin-only to permission-based ============
CREATE OR REPLACE FUNCTION public.edit_stay(p_stay_id uuid, p_guest_name text, p_room_id uuid, p_check_in date, p_check_out date, p_num_guests integer, p_source stay_source, p_accommodation_total numeric, p_notes text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stay record;
  v_capacity integer;
  v_conflict record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'reservations_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED:reservations_manage';
  END IF;

  SELECT s.* INTO v_stay FROM public.stays s WHERE s.id = p_stay_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAY_NOT_FOUND'; END IF;
  IF v_stay.status <> 'active' OR v_stay.confirmation_status = 'rejected' THEN
    RAISE EXCEPTION 'STAY_NOT_EDITABLE';
  END IF;

  IF coalesce(btrim(p_guest_name), '') = '' THEN RAISE EXCEPTION 'GUEST_NAME_REQUIRED'; END IF;
  IF p_room_id IS NULL THEN RAISE EXCEPTION 'ROOM_REQUIRED'; END IF;
  IF p_check_out <= p_check_in THEN RAISE EXCEPTION 'CHECKOUT_AFTER_CHECKIN'; END IF;
  IF coalesce(p_num_guests, 0) < 1 THEN RAISE EXCEPTION 'GUESTS_MIN_ONE'; END IF;
  IF coalesce(p_accommodation_total, 0) < 0 THEN RAISE EXCEPTION 'TOTAL_NON_NEGATIVE'; END IF;

  SELECT r.capacity INTO v_capacity FROM public.rooms r WHERE r.id = p_room_id;
  IF v_capacity IS NULL THEN RAISE EXCEPTION 'ROOM_REQUIRED'; END IF;
  IF p_num_guests > v_capacity THEN RAISE EXCEPTION 'ROOM_CAPACITY:%', v_capacity; END IF;

  IF v_stay.confirmation_status = 'confirmed' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_room_id::text, 0));
    SELECT s.id, s.check_in, s.check_out INTO v_conflict
    FROM public.stays s
    WHERE s.room_id = p_room_id
      AND s.id <> p_stay_id
      AND s.status <> 'cancelled'
      AND s.confirmation_status = 'confirmed'
      AND s.check_in < p_check_out
      AND s.check_out > p_check_in
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'ROOM_CONFLICT:%:%', v_conflict.check_in, v_conflict.check_out;
    END IF;
  END IF;

  UPDATE public.guests SET full_name = btrim(p_guest_name) WHERE id = v_stay.guest_id;

  UPDATE public.stays
     SET room_id = p_room_id, check_in = p_check_in, check_out = p_check_out,
         num_guests = p_num_guests, source = p_source,
         accommodation_total = coalesce(p_accommodation_total, 0),
         notes = nullif(btrim(coalesce(p_notes, '')), '')
   WHERE id = p_stay_id;

  RETURN p_stay_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_reservation(p_stay_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stay record;
  v_capacity integer;
  v_conflict record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'reservations_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED:reservations_manage';
  END IF;

  SELECT s.* INTO v_stay FROM public.stays s WHERE s.id = p_stay_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAY_NOT_FOUND'; END IF;
  IF v_stay.confirmation_status <> 'pending' THEN RAISE EXCEPTION 'NOT_PENDING'; END IF;
  IF v_stay.check_out <= v_stay.check_in THEN RAISE EXCEPTION 'CHECKOUT_AFTER_CHECKIN'; END IF;

  SELECT r.capacity INTO v_capacity FROM public.rooms r WHERE r.id = v_stay.room_id;
  IF v_capacity IS NULL THEN RAISE EXCEPTION 'ROOM_REQUIRED'; END IF;
  IF v_stay.num_guests > v_capacity THEN RAISE EXCEPTION 'ROOM_CAPACITY:%', v_capacity; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_stay.room_id::text, 0));

  SELECT s.id INTO v_conflict
  FROM public.stays s
  WHERE s.room_id = v_stay.room_id AND s.id <> v_stay.id
    AND s.status <> 'cancelled' AND s.confirmation_status = 'confirmed'
    AND s.check_in < v_stay.check_out AND s.check_out > v_stay.check_in
  LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'ROOM_CONFLICT'; END IF;

  UPDATE public.stays
     SET confirmation_status = 'confirmed',
         status = CASE WHEN status = 'cancelled' THEN 'active'::stay_status ELSE status END,
         confirmed_by = auth.uid(), confirmed_at = now()
   WHERE id = p_stay_id;

  RETURN p_stay_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_reservation(p_stay_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stay record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'reservations_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED:reservations_manage';
  END IF;

  SELECT s.* INTO v_stay FROM public.stays s WHERE s.id = p_stay_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAY_NOT_FOUND'; END IF;
  IF v_stay.confirmation_status <> 'pending' THEN RAISE EXCEPTION 'NOT_PENDING'; END IF;

  UPDATE public.stays
     SET confirmation_status = 'rejected', status = 'cancelled'::stay_status,
         confirmed_by = auth.uid(), confirmed_at = now()
   WHERE id = p_stay_id;

  RETURN p_stay_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.checkout_stay(p_stay_id uuid, p_override boolean DEFAULT false)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stay record;
  v_total numeric;
  v_paid numeric;
  v_outstanding numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT s.id, s.status, s.accommodation_total INTO v_stay
  FROM public.stays s WHERE s.id = p_stay_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'STAY_NOT_FOUND'; END IF;
  IF v_stay.status <> 'active' THEN RAISE EXCEPTION 'STAY_NOT_ACTIVE'; END IF;

  SELECT coalesce(v_stay.accommodation_total, 0)
       + coalesce((SELECT sum(c.total) FROM public.charges c WHERE c.stay_id = p_stay_id), 0)
    INTO v_total;
  SELECT coalesce((SELECT sum(p.amount) FROM public.payments p WHERE p.stay_id = p_stay_id), 0)
    INTO v_paid;

  v_outstanding := v_total - v_paid;

  IF v_outstanding > 0 THEN
    IF NOT public.has_permission(auth.uid(), 'checkout_override') THEN
      RAISE EXCEPTION 'OUTSTANDING_BALANCE:%', v_outstanding;
    END IF;
    IF NOT coalesce(p_override, false) THEN
      RAISE EXCEPTION 'OVERRIDE_REQUIRED:%', v_outstanding;
    END IF;
  END IF;

  UPDATE public.stays SET status = 'completed', checked_out_at = now() WHERE id = p_stay_id;
  RETURN v_outstanding;
END;
$$;

CREATE OR REPLACE FUNCTION public.guest_token_generate(p_stay_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stay record;
  v_token text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'guest_access_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED:guest_access_manage';
  END IF;

  SELECT s.* INTO v_stay FROM public.stays s WHERE s.id = p_stay_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAY_NOT_FOUND'; END IF;
  IF v_stay.status <> 'active' OR v_stay.confirmation_status <> 'confirmed' THEN
    RAISE EXCEPTION 'STAY_NOT_ELIGIBLE';
  END IF;

  UPDATE public.guest_access_tokens SET active = false, revoked_at = now()
   WHERE stay_id = p_stay_id AND active;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  INSERT INTO public.guest_access_tokens (stay_id, token, created_by)
  VALUES (p_stay_id, v_token, auth.uid());

  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.guest_token_revoke(p_stay_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'guest_access_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED:guest_access_manage';
  END IF;

  UPDATE public.guest_access_tokens SET active = false, revoked_at = now()
   WHERE stay_id = p_stay_id AND active;
END;
$$;

-- ============ policies that were admin-only become permission-based ============
DROP POLICY IF EXISTS "cash admin only" ON public.cash_reconciliations;
CREATE POLICY "cash by permission" ON public.cash_reconciliations
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'cash_reconcile'))
  WITH CHECK (public.has_permission(auth.uid(), 'cash_reconcile'));

DROP POLICY IF EXISTS "audit admin read" ON public.audit_log;
CREATE POLICY "audit read by permission" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'activity_view'));

DROP POLICY IF EXISTS "payment sessions admin read" ON public.payment_sessions;
CREATE POLICY "payment sessions read by permission" ON public.payment_sessions
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'payments_manage'));