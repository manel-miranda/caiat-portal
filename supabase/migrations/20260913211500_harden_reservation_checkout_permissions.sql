-- Close two SECURITY DEFINER permission gaps found during the systematic RPC review.
--
-- 1. Creating a stay is reservation management and must require reservations_manage.
-- 2. Checkout always changes stay state, so normal checkout also requires reservations_manage;
--    checkout_override remains an additional permission only when a balance is outstanding.

CREATE OR REPLACE FUNCTION public.create_stay_with_guest(
  p_guest_name text,
  p_room_id uuid,
  p_check_in date,
  p_check_out date,
  p_num_guests integer,
  p_source stay_source,
  p_accommodation_total numeric,
  p_notes text,
  p_confirmation_status text DEFAULT 'confirmed'::text,
  p_guest_id uuid DEFAULT NULL::uuid,
  p_phone text DEFAULT NULL::text,
  p_email text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_guest_id uuid;
  v_stay_id uuid;
  v_conflict record;
  v_capacity integer;
  v_conf text := coalesce(p_confirmation_status, 'confirmed');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'reservations_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED:reservations_manage';
  END IF;
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
$function$;

REVOKE ALL ON FUNCTION public.create_stay_with_guest(
  text, uuid, date, date, integer, stay_source, numeric, text, text, uuid, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stay_with_guest(
  text, uuid, date, date, integer, stay_source, numeric, text, text, uuid, text, text
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.checkout_stay(p_stay_id uuid, p_override boolean DEFAULT false)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stay record;
  v_total numeric;
  v_paid numeric;
  v_outstanding numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'reservations_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED:reservations_manage';
  END IF;

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
$function$;

REVOKE ALL ON FUNCTION public.checkout_stay(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_stay(uuid, boolean) TO authenticated, service_role;
