-- 1. Availability flag -------------------------------------------------------
ALTER TABLE public.service_types
  ADD COLUMN IF NOT EXISTS available_today boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.catalog_set_available(p_id uuid, p_available boolean)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  UPDATE public.service_types SET available_today = coalesce(p_available, true), updated_at = now()
   WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'catalog_set_available', 'service_type', p_id,
          jsonb_build_object('available_today', coalesce(p_available, true)));
  RETURN p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.catalog_set_available(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_set_available(uuid, boolean) TO authenticated, service_role;

-- 2. Preview-only order tables ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.preview_food_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stay_id uuid NOT NULL REFERENCES public.stays(id) ON DELETE CASCADE,
  is_preview boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'requested',
  timing text NOT NULL DEFAULT 'asap',
  notes text,
  subtotal numeric NOT NULL DEFAULT 0,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT preview_food_orders_is_preview_chk CHECK (is_preview),
  CONSTRAINT preview_food_orders_status_chk CHECK (status IN
    ('requested','accepted','preparing','ready','delivered','cancelled')),
  CONSTRAINT preview_food_orders_timing_chk CHECK (timing IN
    ('asap','breakfast','lunch','dinner'))
);

CREATE TABLE IF NOT EXISTS public.preview_food_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.preview_food_orders(id) ON DELETE CASCADE,
  service_type_id uuid NOT NULL REFERENCES public.service_types(id),
  label text NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT preview_food_order_items_qty_chk CHECK (quantity BETWEEN 1 AND 20)
);

CREATE INDEX IF NOT EXISTS preview_food_orders_created_idx
  ON public.preview_food_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS preview_food_order_items_order_idx
  ON public.preview_food_order_items (order_id);

GRANT SELECT, UPDATE, DELETE ON public.preview_food_orders TO authenticated;
GRANT SELECT, DELETE ON public.preview_food_order_items TO authenticated;
GRANT ALL ON public.preview_food_orders TO service_role;
GRANT ALL ON public.preview_food_order_items TO service_role;

ALTER TABLE public.preview_food_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preview_food_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "preview orders read" ON public.preview_food_orders
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'requests_manage'));
CREATE POLICY "preview orders update" ON public.preview_food_orders
  FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'requests_manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'requests_manage'));
CREATE POLICY "preview orders delete" ON public.preview_food_orders
  FOR DELETE TO authenticated USING (public.has_permission(auth.uid(), 'requests_manage'));

CREATE POLICY "preview order items read" ON public.preview_food_order_items
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'requests_manage'));
CREATE POLICY "preview order items delete" ON public.preview_food_order_items
  FOR DELETE TO authenticated USING (public.has_permission(auth.uid(), 'requests_manage'));

CREATE OR REPLACE FUNCTION public.preview_food_orders_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS preview_food_orders_touch ON public.preview_food_orders;
CREATE TRIGGER preview_food_orders_touch BEFORE UPDATE ON public.preview_food_orders
  FOR EACH ROW EXECUTE FUNCTION public.preview_food_orders_touch();

-- 3. Guest submission (token scoped, preview only) -----------------------------
CREATE OR REPLACE FUNCTION public.guest_create_preview_food_order(
  p_token text,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_timing text DEFAULT 'asap'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stay_id uuid;
  v_order_id uuid;
  v_timing text := lower(coalesce(p_timing, 'asap'));
  v_count int;
  v_recent int;
  v_item jsonb;
  v_svc record;
  v_qty int;
  v_subtotal numeric := 0;
BEGIN
  v_stay_id := public.guest_stay_for_token(p_token);
  IF v_stay_id IS NULL THEN RAISE EXCEPTION 'INVALID_TOKEN'; END IF;
  IF v_timing NOT IN ('asap','breakfast','lunch','dinner') THEN v_timing := 'asap'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'EMPTY_ORDER'; END IF;
  v_count := jsonb_array_length(p_items);
  IF v_count = 0 THEN RAISE EXCEPTION 'EMPTY_ORDER'; END IF;
  IF v_count > 20 THEN RAISE EXCEPTION 'TOO_MANY_ITEMS'; END IF;
  IF length(coalesce(p_notes, '')) > 500 THEN RAISE EXCEPTION 'NOTES_TOO_LONG'; END IF;

  -- light abuse guard, same spirit as guest_create_request
  SELECT count(*) INTO v_recent FROM public.preview_food_orders
   WHERE stay_id = v_stay_id AND created_at > now() - interval '10 minutes';
  IF v_recent >= 10 THEN RAISE EXCEPTION 'TOO_MANY_REQUESTS'; END IF;

  INSERT INTO public.preview_food_orders(stay_id, timing, notes, subtotal)
  VALUES (v_stay_id, v_timing, nullif(btrim(coalesce(p_notes, '')), ''), 0)
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := coalesce((v_item->>'quantity')::int, 1);
    IF v_qty < 1 THEN v_qty := 1; END IF;
    IF v_qty > 20 THEN v_qty := 20; END IF;

    SELECT st.id, st.label, st.default_price, st.name_i18n
      INTO v_svc
    FROM public.service_types st
    WHERE st.id = (v_item->>'service_type_id')::uuid
      AND st.active AND st.available_today;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ITEM'; END IF;

    INSERT INTO public.preview_food_order_items(
      order_id, service_type_id, label, unit_price, quantity, line_total)
    VALUES (v_order_id, v_svc.id, v_svc.label, v_svc.default_price, v_qty,
            v_svc.default_price * v_qty);
    v_subtotal := v_subtotal + v_svc.default_price * v_qty;
  END LOOP;

  UPDATE public.preview_food_orders SET subtotal = v_subtotal WHERE id = v_order_id;
  RETURN v_order_id;
END;
$$;
REVOKE ALL ON FUNCTION public.guest_create_preview_food_order(text, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_create_preview_food_order(text, jsonb, text, text)
  TO anon, authenticated, service_role;

-- 4. Staff status changes -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_food_order_set_status(p_order_id uuid, p_status text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_old text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'requests_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  IF p_status NOT IN ('requested','accepted','preparing','ready','delivered','cancelled') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  SELECT status INTO v_old FROM public.preview_food_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  UPDATE public.preview_food_orders
     SET status = p_status, updated_by = auth.uid()
   WHERE id = p_order_id;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'preview_food_order_status', 'preview_food_order', p_order_id,
          jsonb_build_object('from', v_old, 'to', p_status, 'preview', true));
  RETURN p_order_id;
END;
$$;
REVOKE ALL ON FUNCTION public.preview_food_order_set_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_food_order_set_status(uuid, text)
  TO authenticated, service_role;

-- 5. Guest portal: expose availability -----------------------------------------
CREATE OR REPLACE FUNCTION public.guest_portal(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stay_id uuid;
  v_stay record;
  v_room record;
  v_guest_name text;
  v_charges jsonb;
  v_requests jsonb;
  v_services jsonb;
  v_demo jsonb;
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
           'name_i18n', st.name_i18n,
           'description_i18n', st.description_i18n,
           'activity_mode', st.activity_mode,
           'difficulty', st.difficulty,
           'featured', st.featured,
           'signature', st.signature,
           'available_today', st.available_today,
           'display_order', st.display_order,
           'recommended_ids', coalesce((
             SELECT jsonb_agg(sr.recommended_service_type_id ORDER BY sr.position)
             FROM public.service_recommendations sr
             WHERE sr.service_type_id = st.id
           ), '[]'::jsonb)
         ) ORDER BY st.display_order, st.sort_order), '[]'::jsonb)
    INTO v_services
  FROM public.service_types st
  WHERE st.active AND st.requestable AND st.guest_visible
    AND NOT st.preview_only AND st.key NOT LIKE 'facility_%';

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
           'name_i18n', st.name_i18n,
           'description_i18n', st.description_i18n,
           'activity_mode', st.activity_mode,
           'difficulty', st.difficulty,
           'featured', st.featured,
           'signature', st.signature,
           'available_today', st.available_today,
           'display_order', st.display_order,
           'recommended_ids', coalesce((
             SELECT jsonb_agg(sr.recommended_service_type_id ORDER BY sr.position)
             FROM public.service_recommendations sr
             WHERE sr.service_type_id = st.id
           ), '[]'::jsonb)
         ) ORDER BY st.display_order, st.sort_order), '[]'::jsonb)
    INTO v_demo
  FROM public.service_types st
  WHERE st.active AND st.preview_only;

  RETURN jsonb_build_object(
    'guest_first_name', v_guest_name,
    'room_name', v_room.name,
    'room_number', v_room.number,
    'check_in', v_stay.check_in,
    'check_out', v_stay.check_out,
    'num_guests', v_stay.num_guests,
    'accommodation_total', v_stay.accommodation_total,
    'charges', v_charges,
    'charges_total', v_charges_total,
    'total', coalesce(v_stay.accommodation_total, 0) + coalesce(v_charges_total, 0),
    'paid', v_paid,
    'outstanding', coalesce(v_stay.accommodation_total, 0) + coalesce(v_charges_total, 0) - coalesce(v_paid, 0),
    'requests', v_requests,
    'services', v_services,
    'demo_services', v_demo
  );
END;
$function$;