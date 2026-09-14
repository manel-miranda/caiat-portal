-- Keep the historical is_preview marker required by the existing table CHECK.
-- The explicit billable flag controls billing; existing rows remain untouched.
CREATE OR REPLACE FUNCTION public.guest_create_preview_food_order(p_token text, p_items jsonb, p_notes text DEFAULT NULL::text, p_timing text DEFAULT 'asap'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT count(*) INTO v_recent FROM public.preview_food_orders
   WHERE stay_id = v_stay_id AND created_at > now() - interval '10 minutes';
  IF v_recent >= 10 THEN RAISE EXCEPTION 'TOO_MANY_REQUESTS'; END IF;

  INSERT INTO public.preview_food_orders(stay_id, timing, notes, subtotal, origin, billable, is_preview)
  VALUES (v_stay_id, v_timing, nullif(btrim(coalesce(p_notes, '')), ''), 0, 'guest', true, true)
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := coalesce((v_item->>'quantity')::int, 1);
    IF v_qty < 1 THEN v_qty := 1; END IF;
    IF v_qty > 20 THEN v_qty := 20; END IF;

    SELECT st.id, st.label, st.default_price
      INTO v_svc
      FROM public.service_types st
     WHERE st.id = (v_item->>'service_type_id')::uuid
       AND st.active
       AND st.available_today
       AND st.requestable
       AND st.guest_visible
       AND NOT st.preview_only
       AND st.guest_category = 'food'
       AND st.guest_subcategory IN ('signature','mains','drinks','desserts');
    IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ITEM'; END IF;

    INSERT INTO public.preview_food_order_items(
      order_id, service_type_id, label, unit_price, quantity, line_total
    ) VALUES (
      v_order_id, v_svc.id, v_svc.label, v_svc.default_price, v_qty,
      v_svc.default_price * v_qty
    );
    v_subtotal := v_subtotal + v_svc.default_price * v_qty;
  END LOOP;

  UPDATE public.preview_food_orders SET subtotal = v_subtotal WHERE id = v_order_id;
  RETURN v_order_id;
END;
$function$;


CREATE OR REPLACE FUNCTION public.staff_create_food_order(
  p_stay_id uuid, p_items jsonb, p_notes text DEFAULT NULL::text, p_timing text DEFAULT 'asap'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_timing text := lower(coalesce(p_timing, 'asap'));
  v_count int;
  v_item jsonb;
  v_svc record;
  v_qty int;
  v_subtotal numeric := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(), 'requests_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED:requests_manage';
  END IF;
  PERFORM 1 FROM public.stays s
   WHERE s.id = p_stay_id AND s.status = 'active' AND s.confirmation_status = 'confirmed'
   FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAY_NOT_ACTIVE'; END IF;
  IF v_timing NOT IN ('asap','breakfast','lunch','dinner') THEN v_timing := 'asap'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'EMPTY_ORDER'; END IF;
  v_count := jsonb_array_length(p_items);
  IF v_count = 0 THEN RAISE EXCEPTION 'EMPTY_ORDER'; END IF;
  IF v_count > 20 THEN RAISE EXCEPTION 'TOO_MANY_ITEMS'; END IF;
  IF length(coalesce(p_notes, '')) > 500 THEN RAISE EXCEPTION 'NOTES_TOO_LONG'; END IF;

  INSERT INTO public.preview_food_orders(
    stay_id, timing, notes, subtotal, origin, billable, is_preview, created_by, updated_by)
  VALUES (
    p_stay_id, v_timing, nullif(btrim(coalesce(p_notes, '')), ''), 0,
    'staff', true, true, auth.uid(), auth.uid())
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := coalesce((v_item->>'quantity')::int, 1);
    IF v_qty < 1 THEN v_qty := 1; END IF;
    IF v_qty > 20 THEN v_qty := 20; END IF;

    SELECT st.id, st.label, st.default_price
      INTO v_svc
      FROM public.service_types st
     WHERE st.id = (v_item->>'service_type_id')::uuid
       AND st.active
       AND st.available_today
       AND st.requestable
       AND st.guest_visible
       AND NOT st.preview_only
       AND st.guest_category = 'food'
       AND st.guest_subcategory IN ('signature','mains','drinks','desserts');
    IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ITEM'; END IF;

    INSERT INTO public.preview_food_order_items(
      order_id, service_type_id, label, unit_price, quantity, line_total
    ) VALUES (
      v_order_id, v_svc.id, v_svc.label, v_svc.default_price, v_qty,
      v_svc.default_price * v_qty
    );
    v_subtotal := v_subtotal + v_svc.default_price * v_qty;
  END LOOP;

  UPDATE public.preview_food_orders SET subtotal = v_subtotal WHERE id = v_order_id;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'food_order.created', 'preview_food_order', v_order_id,
          jsonb_build_object('origin','staff','stay_id',p_stay_id,'subtotal',v_subtotal));
  RETURN v_order_id;
END;
$function$;

