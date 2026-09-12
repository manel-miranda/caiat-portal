-- 1. Additive catalogue presentation metadata -------------------------------
ALTER TABLE public.service_types
  ADD COLUMN IF NOT EXISTS guest_category text,
  ADD COLUMN IF NOT EXISTS guest_subcategory text,
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS guest_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS signature boolean NOT NULL DEFAULT false;

-- Backfill display_order from the existing staff sort order.
UPDATE public.service_types SET display_order = sort_order WHERE display_order = 0;

-- Food & Drinks
UPDATE public.service_types SET guest_category = 'food', guest_subcategory = 'breakfast' WHERE key = 'breakfast';
UPDATE public.service_types SET guest_category = 'food', guest_subcategory = 'meals' WHERE key IN ('lunch','dinner');
UPDATE public.service_types SET guest_category = 'food', guest_subcategory = 'room_service' WHERE key = 'room_service';

-- Activities (outdoor services)
UPDATE public.service_types SET guest_category = 'activities', guest_subcategory = 'hiking' WHERE key = 'activity';
UPDATE public.service_types SET guest_category = 'activities', guest_subcategory = 'climbing' WHERE key = 'climbing';
UPDATE public.service_types SET guest_category = 'activities', guest_subcategory = 'cycling' WHERE key = 'downhill';
UPDATE public.service_types SET guest_category = 'activities', guest_subcategory = 'wellness' WHERE key = 'yoga';
UPDATE public.service_types SET guest_category = 'activities', guest_subcategory = 'other' WHERE key IN ('mule_support','local_guide');

-- Activities (routes) split by activity mode
UPDATE public.service_types SET guest_category = 'activities',
       guest_subcategory = CASE WHEN activity_mode ILIKE 'bike%' THEN 'cycling' ELSE 'hiking' END
 WHERE category = 'route';

-- Explore
UPDATE public.service_types SET guest_category = 'explore' WHERE category = 'visit';

-- Transport
UPDATE public.service_types SET guest_category = 'transport' WHERE category = 'transport';

-- Stay extras
UPDATE public.service_types SET guest_category = 'extras' WHERE key IN ('laundry','itinerary_planning','extra_night');

-- Free-text catch-all lives in the "Something else" step
UPDATE public.service_types SET guest_category = 'else' WHERE key = 'other';

-- Facilities remain informational only
UPDATE public.service_types SET guest_category = 'info', guest_visible = false WHERE key LIKE 'facility_%';

-- Anything still unmapped but requestable falls back to Stay extras so it stays reachable.
UPDATE public.service_types SET guest_category = 'extras'
 WHERE guest_category IS NULL AND requestable;

-- 2. Privacy-minimal catalogue interaction events (schema only for now) -----
CREATE TABLE IF NOT EXISTS public.guest_catalog_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stay_id uuid REFERENCES public.stays(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('category_view','item_view','request_started','request_submitted')),
  category text,
  subcategory text,
  service_type_id uuid REFERENCES public.service_types(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.guest_catalog_events TO service_role;
ALTER TABLE public.guest_catalog_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalog events read by permission"
  ON public.guest_catalog_events FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'activity_view'));

GRANT SELECT ON public.guest_catalog_events TO authenticated;

CREATE INDEX IF NOT EXISTS guest_catalog_events_created_idx ON public.guest_catalog_events (created_at DESC);

-- 3. Guest portal returns the richer catalogue -------------------------------
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
           'category', st.category,
           'guest_category', st.guest_category,
           'guest_subcategory', st.guest_subcategory,
           'short_description', st.short_description,
           'activity_mode', st.activity_mode,
           'difficulty', st.difficulty,
           'featured', st.featured,
           'signature', st.signature,
           'display_order', st.display_order
         ) ORDER BY st.display_order, st.sort_order), '[]'::jsonb)
    INTO v_services
  FROM public.service_types st
  WHERE st.active AND st.requestable AND st.guest_visible AND st.key NOT LIKE 'facility_%';

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