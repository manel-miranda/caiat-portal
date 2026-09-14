-- Corrective follow-up to the kitchen-order migration.
-- 1. Menu eligibility for staff-created orders mirrors the guest menu exactly.
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
    'staff', true, false, auth.uid(), auth.uid())
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

-- 2. Billing helper: financial authority + explicit stay validation.
CREATE OR REPLACE FUNCTION public.food_order_bill(p_order_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.preview_food_orders%ROWTYPE;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(), 'requests_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED:requests_manage';
  END IF;

  SELECT * INTO v_order FROM public.preview_food_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  -- Legacy/demo orders are explicitly not billable; never charge them.
  IF NOT v_order.billable OR v_order.status <> 'delivered' THEN RETURN 0; END IF;

  -- Creating a charge is a financial act: same authority as complete_request.
  IF NOT public.has_permission(auth.uid(), 'payments_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED:payments_manage';
  END IF;

  PERFORM 1 FROM public.stays s
   WHERE s.id = v_order.stay_id AND s.status = 'active' AND s.confirmation_status = 'confirmed'
   FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAY_NOT_ACTIVE'; END IF;

  INSERT INTO public.charges(
    stay_id, service_type_id, label, quantity, unit_price, notes, created_by,
    source_food_order_id, source_food_order_item_id)
  SELECT v_order.stay_id, oi.service_type_id, oi.label, oi.quantity, oi.unit_price,
         '[food_order:' || p_order_id::text || ']', auth.uid(), p_order_id, oi.id
    FROM public.preview_food_order_items oi
   WHERE oi.order_id = p_order_id
  ON CONFLICT (source_food_order_item_id) WHERE source_food_order_item_id IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- 3. Validate everything before any status / stock / billing side effect.
CREATE OR REPLACE FUNCTION public.preview_food_order_set_status(p_order_id uuid, p_status text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old text;
  v_billable boolean;
  v_stay_id uuid;
  v_billed integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'requests_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  IF p_status NOT IN ('requested','accepted','preparing','ready','delivered','cancelled') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  SELECT status, billable, stay_id INTO v_old, v_billable, v_stay_id
    FROM public.preview_food_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  -- Terminal states are final: no re-delivery, no reopening a cancelled order.
  IF v_old IN ('delivered','cancelled') THEN RETURN p_order_id; END IF;

  -- Billable orders: the stay must still be open before anything changes.
  -- Cancellation is always allowed and has no side effects.
  IF coalesce(v_billable, false) AND p_status <> 'cancelled' THEN
    PERFORM 1 FROM public.stays s
     WHERE s.id = v_stay_id AND s.status = 'active' AND s.confirmation_status = 'confirmed'
     FOR NO KEY UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'STAY_NOT_ACTIVE'; END IF;
    IF p_status = 'delivered'
       AND NOT public.has_permission(auth.uid(), 'payments_manage') THEN
      RAISE EXCEPTION 'PERMISSION_DENIED:payments_manage';
    END IF;
  END IF;

  UPDATE public.preview_food_orders
     SET status = p_status, updated_by = auth.uid()
   WHERE id = p_order_id;

  IF p_status = 'delivered' THEN
    PERFORM public.inventory_consume_preview_order(p_order_id);
    v_billed := public.food_order_bill(p_order_id);
  END IF;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'preview_food_order_status', 'preview_food_order', p_order_id,
          jsonb_build_object('from', v_old, 'to', p_status, 'charges_created', v_billed));
  RETURN p_order_id;
END;
$function$;