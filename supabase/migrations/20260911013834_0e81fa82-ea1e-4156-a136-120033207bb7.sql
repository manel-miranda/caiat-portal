CREATE OR REPLACE FUNCTION public.edit_stay(
  p_stay_id uuid,
  p_guest_name text,
  p_room_id uuid,
  p_check_in date,
  p_check_out date,
  p_num_guests integer,
  p_source stay_source,
  p_accommodation_total numeric,
  p_notes text
)
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
  IF v_stay.status <> 'active' OR v_stay.confirmation_status = 'rejected' THEN
    RAISE EXCEPTION 'STAY_NOT_EDITABLE';
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

  -- Pending enquiries do not reserve inventory, so they may overlap freely.
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

  -- Reuse the existing guest row: never orphan history or create a duplicate.
  UPDATE public.guests SET full_name = btrim(p_guest_name) WHERE id = v_stay.guest_id;

  UPDATE public.stays
     SET room_id = p_room_id,
         check_in = p_check_in,
         check_out = p_check_out,
         num_guests = p_num_guests,
         source = p_source,
         accommodation_total = coalesce(p_accommodation_total, 0),
         notes = nullif(btrim(coalesce(p_notes, '')), '')
   WHERE id = p_stay_id;

  RETURN p_stay_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.edit_stay(uuid, text, uuid, date, date, integer, stay_source, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_stay(uuid, text, uuid, date, date, integer, stay_source, numeric, text) TO authenticated, service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.guests;