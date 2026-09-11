ALTER TABLE public.stays
  ADD COLUMN IF NOT EXISTS confirmation_status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

UPDATE public.stays SET confirmation_status = 'confirmed' WHERE confirmation_status IS NULL;

ALTER TABLE public.stays DROP CONSTRAINT IF EXISTS stays_confirmation_status_check;
ALTER TABLE public.stays ADD CONSTRAINT stays_confirmation_status_check
  CHECK (confirmation_status IN ('pending','confirmed','rejected'));

CREATE OR REPLACE FUNCTION public.create_stay_with_guest(
  p_guest_name text,
  p_room_id uuid,
  p_check_in date,
  p_check_out date,
  p_num_guests integer,
  p_source stay_source,
  p_accommodation_total numeric,
  p_notes text,
  p_confirmation_status text DEFAULT 'confirmed'
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF v_conf NOT IN ('pending','confirmed') THEN
    RAISE EXCEPTION 'INVALID_CONFIRMATION_STATUS';
  END IF;
  IF coalesce(btrim(p_guest_name), '') = '' THEN
    RAISE EXCEPTION 'GUEST_NAME_REQUIRED';
  END IF;
  IF p_room_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_REQUIRED';
  END IF;
  IF p_check_out <= p_check_in THEN
    RAISE EXCEPTION 'CHECKOUT_AFTER_CHECKIN';
  END IF;
  IF coalesce(p_num_guests, 0) < 1 THEN
    RAISE EXCEPTION 'GUESTS_MIN_ONE';
  END IF;
  IF coalesce(p_accommodation_total, 0) < 0 THEN
    RAISE EXCEPTION 'TOTAL_NON_NEGATIVE';
  END IF;

  SELECT r.capacity INTO v_capacity FROM public.rooms r WHERE r.id = p_room_id;
  IF v_capacity IS NULL THEN
    RAISE EXCEPTION 'ROOM_REQUIRED';
  END IF;
  IF p_num_guests > v_capacity THEN
    RAISE EXCEPTION 'ROOM_CAPACITY:%', v_capacity;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_room_id::text, 0));

  -- Pending requests are only enquiries: they never reserve inventory and are
  -- therefore not blocked by, and do not block, other reservations.
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

  INSERT INTO public.guests (full_name) VALUES (btrim(p_guest_name)) RETURNING id INTO v_guest_id;

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

CREATE OR REPLACE FUNCTION public.confirm_reservation(p_stay_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stay record;
  v_capacity integer;
  v_conflict record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED';
  END IF;

  SELECT s.* INTO v_stay FROM public.stays s WHERE s.id = p_stay_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STAY_NOT_FOUND';
  END IF;
  IF v_stay.confirmation_status <> 'pending' THEN
    RAISE EXCEPTION 'NOT_PENDING';
  END IF;
  IF v_stay.check_out <= v_stay.check_in THEN
    RAISE EXCEPTION 'CHECKOUT_AFTER_CHECKIN';
  END IF;

  SELECT r.capacity INTO v_capacity FROM public.rooms r WHERE r.id = v_stay.room_id;
  IF v_capacity IS NULL THEN
    RAISE EXCEPTION 'ROOM_REQUIRED';
  END IF;
  IF v_stay.num_guests > v_capacity THEN
    RAISE EXCEPTION 'ROOM_CAPACITY:%', v_capacity;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_stay.room_id::text, 0));

  SELECT s.id INTO v_conflict
  FROM public.stays s
  WHERE s.room_id = v_stay.room_id
    AND s.id <> v_stay.id
    AND s.status <> 'cancelled'
    AND s.confirmation_status = 'confirmed'
    AND s.check_in < v_stay.check_out
    AND s.check_out > v_stay.check_in
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'ROOM_CONFLICT';
  END IF;

  UPDATE public.stays
     SET confirmation_status = 'confirmed',
         status = CASE WHEN status = 'cancelled' THEN 'active'::stay_status ELSE status END,
         confirmed_by = auth.uid(),
         confirmed_at = now()
   WHERE id = p_stay_id;

  RETURN p_stay_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_reservation(p_stay_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stay record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED';
  END IF;

  SELECT s.* INTO v_stay FROM public.stays s WHERE s.id = p_stay_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STAY_NOT_FOUND';
  END IF;
  IF v_stay.confirmation_status <> 'pending' THEN
    RAISE EXCEPTION 'NOT_PENDING';
  END IF;

  UPDATE public.stays
     SET confirmation_status = 'rejected',
         status = 'cancelled'::stay_status,
         confirmed_by = auth.uid(),
         confirmed_at = now()
   WHERE id = p_stay_id;

  RETURN p_stay_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_stay_with_guest(text, uuid, date, date, integer, stay_source, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stay_with_guest(text, uuid, date, date, integer, stay_source, numeric, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.confirm_reservation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_reservation(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reject_reservation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_reservation(uuid) TO authenticated, service_role;