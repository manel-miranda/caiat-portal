-- 1. Make the two vetted functions SECURITY DEFINER with fixed search_path
CREATE OR REPLACE FUNCTION public.create_stay_with_guest(p_guest_name text, p_room_id uuid, p_check_in date, p_check_out date, p_num_guests integer, p_source stay_source, p_accommodation_total numeric, p_notes text)
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
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

  SELECT s.id, s.check_in, s.check_out INTO v_conflict
  FROM public.stays s
  WHERE s.room_id = p_room_id
    AND s.status <> 'cancelled'
    AND s.check_in < p_check_out
    AND s.check_out > p_check_in
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'ROOM_CONFLICT:%:%', v_conflict.check_in, v_conflict.check_out;
  END IF;

  INSERT INTO public.guests (full_name) VALUES (btrim(p_guest_name)) RETURNING id INTO v_guest_id;

  INSERT INTO public.stays (
    guest_id, room_id, check_in, check_out, num_guests, source,
    accommodation_total, notes, created_by
  ) VALUES (
    v_guest_id, p_room_id, p_check_in, p_check_out, p_num_guests, p_source,
    coalesce(p_accommodation_total, 0), nullif(btrim(coalesce(p_notes, '')), ''), auth.uid()
  ) RETURNING id INTO v_stay_id;

  RETURN v_stay_id;
END;
$function$;

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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT s.id, s.status, s.accommodation_total INTO v_stay
  FROM public.stays s WHERE s.id = p_stay_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STAY_NOT_FOUND';
  END IF;
  IF v_stay.status <> 'active' THEN
    RAISE EXCEPTION 'STAY_NOT_ACTIVE';
  END IF;

  SELECT coalesce(v_stay.accommodation_total, 0)
       + coalesce((SELECT sum(c.total) FROM public.charges c WHERE c.stay_id = p_stay_id), 0)
    INTO v_total;
  SELECT coalesce((SELECT sum(p.amount) FROM public.payments p WHERE p.stay_id = p_stay_id), 0)
    INTO v_paid;

  v_outstanding := v_total - v_paid;

  IF v_outstanding > 0 THEN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'OUTSTANDING_BALANCE:%', v_outstanding;
    END IF;
    IF NOT coalesce(p_override, false) THEN
      RAISE EXCEPTION 'OVERRIDE_REQUIRED:%', v_outstanding;
    END IF;
  END IF;

  UPDATE public.stays
     SET status = 'completed', checked_out_at = now()
   WHERE id = p_stay_id;

  RETURN v_outstanding;
END;
$function$;

-- 2. Execute grants
REVOKE ALL ON FUNCTION public.create_stay_with_guest(text, uuid, date, date, integer, stay_source, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.checkout_stay(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stay_with_guest(text, uuid, date, date, integer, stay_source, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.checkout_stay(uuid, boolean) TO authenticated, service_role;

-- 3. Restrict direct table access on stays
DROP POLICY IF EXISTS "stays all authenticated" ON public.stays;
CREATE POLICY "stays read authenticated" ON public.stays FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.stays FROM authenticated;
GRANT SELECT ON public.stays TO authenticated;
GRANT ALL ON public.stays TO service_role;