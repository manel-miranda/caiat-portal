-- Serialize checkout with both restaurant entry points using the stay row.
-- Staff creation already takes this lock; guest creation must also recheck
-- the stay after waiting for a concurrent checkout to finish.
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

  PERFORM 1 FROM public.stays s
   WHERE s.id = v_stay_id AND s.status = 'active' AND s.confirmation_status = 'confirmed'
   FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_TOKEN'; END IF;

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

  -- Do not lock order rows here: delivery locks an order before its stay.
  -- The stay lock serializes creation; this MVCC read can conservatively block
  -- checkout until an in-progress delivery or cancellation has committed.
  IF EXISTS (
    SELECT 1 FROM public.preview_food_orders o
     WHERE o.stay_id = p_stay_id AND o.billable
       AND o.status NOT IN ('delivered', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'FOOD_ORDERS_PENDING';
  END IF;

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