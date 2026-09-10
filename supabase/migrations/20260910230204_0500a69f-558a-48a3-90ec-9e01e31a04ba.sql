CREATE OR REPLACE FUNCTION public.create_stay_with_guest(
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
SET search_path = public
AS $$
DECLARE
  v_guest_id uuid;
  v_stay_id uuid;
  v_conflict record;
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
$$;

REVOKE ALL ON FUNCTION public.create_stay_with_guest(text, uuid, date, date, integer, stay_source, numeric, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_stay_with_guest(text, uuid, date, date, integer, stay_source, numeric, text) TO authenticated;