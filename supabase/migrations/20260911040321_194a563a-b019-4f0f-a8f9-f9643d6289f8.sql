-- 1. Guest access tokens ---------------------------------------------------
CREATE TABLE public.guest_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stay_id uuid NOT NULL REFERENCES public.stays(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX guest_access_tokens_stay_idx ON public.guest_access_tokens(stay_id);

GRANT SELECT ON public.guest_access_tokens TO authenticated;
GRANT ALL ON public.guest_access_tokens TO service_role;

ALTER TABLE public.guest_access_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guest tokens readable by staff"
  ON public.guest_access_tokens FOR SELECT TO authenticated USING (true);

-- 2. Origin marker on requests ---------------------------------------------
ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS created_via text NOT NULL DEFAULT 'staff';

-- 3. Helper: resolve a token to a live stay ---------------------------------
CREATE OR REPLACE FUNCTION public.guest_stay_for_token(p_token text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.guest_access_tokens g
  JOIN public.stays s ON s.id = g.stay_id
  WHERE g.token = p_token
    AND g.active
    AND s.status = 'active'
    AND s.confirmation_status = 'confirmed'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.guest_stay_for_token(text) FROM PUBLIC, anon, authenticated;

-- 4. Admin: generate / regenerate ------------------------------------------
CREATE OR REPLACE FUNCTION public.guest_token_generate(p_stay_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stay record;
  v_token text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;

  SELECT s.* INTO v_stay FROM public.stays s WHERE s.id = p_stay_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAY_NOT_FOUND'; END IF;
  IF v_stay.status <> 'active' OR v_stay.confirmation_status <> 'confirmed' THEN
    RAISE EXCEPTION 'STAY_NOT_ELIGIBLE';
  END IF;

  UPDATE public.guest_access_tokens
     SET active = false, revoked_at = now()
   WHERE stay_id = p_stay_id AND active;

  -- 24 random bytes = 192 bits of entropy.
  v_token := encode(gen_random_bytes(24), 'hex');

  INSERT INTO public.guest_access_tokens (stay_id, token, created_by)
  VALUES (p_stay_id, v_token, auth.uid());

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.guest_token_generate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guest_token_generate(uuid) TO authenticated, service_role;

-- 5. Admin: revoke ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guest_token_revoke(p_stay_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;

  UPDATE public.guest_access_tokens
     SET active = false, revoked_at = now()
   WHERE stay_id = p_stay_id AND active;
END;
$$;

REVOKE ALL ON FUNCTION public.guest_token_revoke(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guest_token_revoke(uuid) TO authenticated, service_role;

-- 6. Guest portal read ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guest_portal(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stay_id uuid;
  v_stay record;
  v_room record;
  v_guest_name text;
  v_charges jsonb;
  v_requests jsonb;
  v_services jsonb;
  v_paid numeric;
  v_charges_total numeric;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN RETURN NULL; END IF;
  v_stay_id := public.guest_stay_for_token(p_token);
  IF v_stay_id IS NULL THEN RETURN NULL; END IF;

  SELECT s.id, s.check_in, s.check_out, s.num_guests, s.accommodation_total, s.status,
         s.confirmation_status, s.room_id, s.guest_id
    INTO v_stay
  FROM public.stays s WHERE s.id = v_stay_id;

  SELECT r.name, r.number INTO v_room FROM public.rooms r WHERE r.id = v_stay.room_id;
  SELECT split_part(btrim(g.full_name), ' ', 1) INTO v_guest_name
    FROM public.guests g WHERE g.id = v_stay.guest_id;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'created_at'), '[]'::jsonb), coalesce(sum(t), 0)
    INTO v_charges, v_charges_total
  FROM (
    SELECT jsonb_build_object(
             'id', c.id,
             'label', c.label,
             'quantity', c.quantity,
             'total', c.total,
             'created_at', c.created_at
           ) AS x,
           c.total AS t
    FROM public.charges c WHERE c.stay_id = v_stay_id
  ) q;

  SELECT coalesce(sum(p.amount), 0) INTO v_paid
    FROM public.payments p WHERE p.stay_id = v_stay_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id,
           'label', r.label,
           'status', r.status,
           'scheduled_at', r.scheduled_at,
           'created_at', r.created_at,
           'created_via', r.created_via
         ) ORDER BY r.created_at DESC), '[]'::jsonb)
    INTO v_requests
  FROM public.requests r
  WHERE r.stay_id = v_stay_id AND r.created_via = 'guest_portal';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', st.id,
           'key', st.key,
           'label', st.label,
           'default_price', st.default_price,
           'billable', st.billable,
           'category', st.category
         ) ORDER BY st.sort_order), '[]'::jsonb)
    INTO v_services
  FROM public.service_types st
  WHERE st.active AND st.requestable AND st.key NOT LIKE 'facility_%';

  RETURN jsonb_build_object(
    'guest_first_name', v_guest_name,
    'room_name', v_room.name,
    'room_number', v_room.number,
    'check_in', v_stay.check_in,
    'check_out', v_stay.check_out,
    'num_guests', v_stay.num_guests,
    'status', v_stay.status,
    'confirmation_status', v_stay.confirmation_status,
    'accommodation_total', v_stay.accommodation_total,
    'charges', v_charges,
    'charges_total', v_charges_total,
    'total', coalesce(v_stay.accommodation_total, 0) + v_charges_total,
    'paid', v_paid,
    'outstanding', greatest(0, coalesce(v_stay.accommodation_total, 0) + v_charges_total - v_paid),
    'requests', v_requests,
    'services', v_services
  );
END;
$$;

REVOKE ALL ON FUNCTION public.guest_portal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_portal(text) TO anon, authenticated, service_role;

-- 7. Guest creates a request ------------------------------------------------
CREATE OR REPLACE FUNCTION public.guest_create_request(
  p_token text,
  p_service_type_id uuid,
  p_custom_label text,
  p_notes text,
  p_kind text DEFAULT 'service'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stay_id uuid;
  v_room_id uuid;
  v_label text;
  v_recent integer;
  v_open integer;
  v_id uuid;
BEGIN
  v_stay_id := public.guest_stay_for_token(p_token);
  IF v_stay_id IS NULL THEN RAISE EXCEPTION 'INVALID_TOKEN'; END IF;
  IF p_kind NOT IN ('service', 'payment_help') THEN RAISE EXCEPTION 'INVALID_KIND'; END IF;

  SELECT s.room_id INTO v_room_id FROM public.stays s WHERE s.id = v_stay_id;

  -- Simple abuse controls: burst limit and open-request cap.
  SELECT count(*) INTO v_recent FROM public.requests
   WHERE stay_id = v_stay_id AND created_via = 'guest_portal'
     AND created_at > now() - interval '2 minutes';
  IF v_recent >= 3 THEN RAISE EXCEPTION 'TOO_MANY_REQUESTS'; END IF;

  SELECT count(*) INTO v_open FROM public.requests
   WHERE stay_id = v_stay_id AND created_via = 'guest_portal' AND status = 'pending';
  IF v_open >= 15 THEN RAISE EXCEPTION 'TOO_MANY_REQUESTS'; END IF;

  IF p_kind = 'payment_help' THEN
    v_label := 'Payment assistance';
  ELSIF p_service_type_id IS NOT NULL THEN
    SELECT st.label INTO v_label FROM public.service_types st
     WHERE st.id = p_service_type_id AND st.active AND st.requestable
       AND st.key NOT LIKE 'facility_%';
    IF v_label IS NULL THEN RAISE EXCEPTION 'INVALID_SERVICE'; END IF;
  ELSE
    v_label := btrim(coalesce(p_custom_label, ''));
    IF v_label = '' THEN RAISE EXCEPTION 'LABEL_REQUIRED'; END IF;
    IF length(v_label) > 80 THEN RAISE EXCEPTION 'LABEL_TOO_LONG'; END IF;
  END IF;

  IF length(coalesce(p_notes, '')) > 500 THEN RAISE EXCEPTION 'NOTES_TOO_LONG'; END IF;

  INSERT INTO public.requests (stay_id, room_id, service_type_id, label, notes, status, created_via)
  VALUES (
    v_stay_id,
    v_room_id,
    CASE WHEN p_kind = 'payment_help' THEN NULL ELSE p_service_type_id END,
    v_label,
    nullif(btrim(coalesce(p_notes, '')), ''),
    'pending',
    'guest_portal'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.guest_create_request(text, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_create_request(text, uuid, text, text, text) TO anon, authenticated, service_role;