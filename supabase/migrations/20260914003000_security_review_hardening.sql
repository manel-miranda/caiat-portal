-- Security hardening from the independent repository review.
-- Make sensitive state transitions server-authoritative and close legacy write paths.

-- 1) Profiles: authenticated users must not be able to reactivate or rename themselves.
DROP POLICY IF EXISTS "own profile update" ON public.profiles;
REVOKE INSERT, UPDATE ON public.profiles FROM authenticated;

-- 2) Cash reconciliation: browser submits only the physical count; expected cash is
-- recomputed from cash payments for the Africa/Casablanca business day.
DROP POLICY IF EXISTS "cash by permission" ON public.cash_reconciliations;
REVOKE INSERT, UPDATE, DELETE ON public.cash_reconciliations FROM authenticated;
CREATE POLICY "cash read by permission" ON public.cash_reconciliations
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'cash_reconcile'));

CREATE OR REPLACE FUNCTION public.cash_reconcile(
  p_business_date date,
  p_counted_total numeric,
  p_notes text DEFAULT NULL
) RETURNS public.cash_reconciliations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_expected numeric;
  v_row public.cash_reconciliations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(), 'cash_reconcile') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED:cash_reconcile';
  END IF;
  IF p_business_date IS NULL THEN RAISE EXCEPTION 'BUSINESS_DATE_REQUIRED'; END IF;
  IF p_counted_total IS NULL OR p_counted_total < 0 THEN RAISE EXCEPTION 'COUNTED_TOTAL_INVALID'; END IF;

  v_start := p_business_date::timestamp AT TIME ZONE 'Africa/Casablanca';
  v_end := (p_business_date + 1)::timestamp AT TIME ZONE 'Africa/Casablanca';

  SELECT coalesce(sum(p.amount), 0)
    INTO v_expected
    FROM public.payments p
   WHERE p.method = 'cash'
     AND p.created_at >= v_start
     AND p.created_at < v_end;

  INSERT INTO public.cash_reconciliations(
    business_date, expected_total, counted_total, notes, closed_by, closed_at
  ) VALUES (
    p_business_date, v_expected, p_counted_total,
    nullif(btrim(coalesce(p_notes, '')), ''), auth.uid(), now()
  )
  ON CONFLICT (business_date) DO UPDATE SET
    expected_total = EXCLUDED.expected_total,
    counted_total = EXCLUDED.counted_total,
    notes = EXCLUDED.notes,
    closed_by = auth.uid(),
    closed_at = now()
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(), 'cash.reconciled', 'cash_reconciliation', v_row.id,
    jsonb_build_object(
      'business_date', v_row.business_date,
      'expected_total', v_row.expected_total,
      'counted_total', v_row.counted_total,
      'difference', v_row.difference
    )
  );

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.cash_reconcile(date, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cash_reconcile(date, numeric, text) TO authenticated, service_role;

-- 3) Food orders: state changes must go through the RPC so delivery cannot skip
-- inventory consumption/audit, and orders cannot be deleted after consumption.
DROP POLICY IF EXISTS "preview orders update" ON public.preview_food_orders;
DROP POLICY IF EXISTS "preview orders delete" ON public.preview_food_orders;
REVOKE UPDATE, DELETE ON public.preview_food_orders FROM authenticated;

-- Guest food ordering may only reference actual guest-visible/requestable food menu rows.
CREATE OR REPLACE FUNCTION public.guest_create_preview_food_order(
  p_token text,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_timing text DEFAULT 'asap'
) RETURNS uuid
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
$$;
REVOKE ALL ON FUNCTION public.guest_create_preview_food_order(text, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_create_preview_food_order(text, jsonb, text, text)
  TO anon, authenticated, service_role;

-- 4) Completed stays are financially immutable through normal authenticated writes.
DROP POLICY IF EXISTS "charges insert" ON public.charges;
DROP POLICY IF EXISTS "charges update" ON public.charges;
DROP POLICY IF EXISTS "charges delete" ON public.charges;
CREATE POLICY "charges insert" ON public.charges
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'payments_manage')
    AND EXISTS (SELECT 1 FROM public.stays s WHERE s.id = stay_id AND s.status = 'active')
  );
CREATE POLICY "charges update" ON public.charges
  FOR UPDATE TO authenticated
  USING (
    public.has_permission(auth.uid(), 'payments_manage')
    AND EXISTS (SELECT 1 FROM public.stays s WHERE s.id = stay_id AND s.status = 'active')
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'payments_manage')
    AND EXISTS (SELECT 1 FROM public.stays s WHERE s.id = stay_id AND s.status = 'active')
  );
CREATE POLICY "charges delete" ON public.charges
  FOR DELETE TO authenticated
  USING (
    public.has_permission(auth.uid(), 'payments_manage')
    AND EXISTS (SELECT 1 FROM public.stays s WHERE s.id = stay_id AND s.status = 'active')
  );

DROP POLICY IF EXISTS "payments insert" ON public.payments;
CREATE POLICY "payments insert" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    received_by = auth.uid()
    AND public.has_permission(auth.uid(), 'payments_manage')
    AND EXISTS (SELECT 1 FROM public.stays s WHERE s.id = stay_id AND s.status = 'active')
  );

-- 5) Request completion + billing is one locked server transaction with a durable
-- unique idempotency anchor rather than a browser-side notes lookup.
ALTER TABLE public.charges
  ADD COLUMN IF NOT EXISTS source_request_id uuid REFERENCES public.requests(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS charges_source_request_uniq
  ON public.charges(source_request_id) WHERE source_request_id IS NOT NULL;

DROP POLICY IF EXISTS "requests update" ON public.requests;
DROP POLICY IF EXISTS "requests delete" ON public.requests;
REVOKE UPDATE, DELETE ON public.requests FROM authenticated;

CREATE OR REPLACE FUNCTION public.complete_request(
  p_request_id uuid,
  p_with_charge boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request public.requests%ROWTYPE;
  v_service record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(), 'requests_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED:requests_manage';
  END IF;

  SELECT * INTO v_request FROM public.requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF v_request.status <> 'pending' THEN RETURN p_request_id; END IF;

  IF coalesce(p_with_charge, false) THEN
    IF v_request.stay_id IS NULL OR v_request.service_type_id IS NULL THEN
      RAISE EXCEPTION 'REQUEST_NOT_BILLABLE';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.stays s WHERE s.id = v_request.stay_id AND s.status = 'active'
    ) THEN
      RAISE EXCEPTION 'STAY_NOT_ACTIVE';
    END IF;

    SELECT st.default_price, st.billable
      INTO v_service
      FROM public.service_types st
     WHERE st.id = v_request.service_type_id;
    IF NOT FOUND OR NOT v_service.billable THEN RAISE EXCEPTION 'REQUEST_NOT_BILLABLE'; END IF;

    INSERT INTO public.charges(
      stay_id, service_type_id, label, quantity, unit_price, notes, created_by, source_request_id
    ) VALUES (
      v_request.stay_id, v_request.service_type_id, v_request.label, 1,
      v_service.default_price, '[req:' || p_request_id::text || ']', auth.uid(), p_request_id
    )
    ON CONFLICT (source_request_id) WHERE source_request_id IS NOT NULL DO NOTHING;
  END IF;

  UPDATE public.requests
     SET status = 'completed', completed_by = auth.uid(), completed_at = now()
   WHERE id = p_request_id;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(), 'request.completed', 'request', p_request_id,
    jsonb_build_object('billed', coalesce(p_with_charge, false))
  );
  RETURN p_request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_request(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancel_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status public.request_status;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(), 'requests_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED:requests_manage';
  END IF;

  SELECT status INTO v_status FROM public.requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF v_status <> 'pending' THEN RETURN p_request_id; END IF;

  UPDATE public.requests
     SET status = 'cancelled', completed_by = auth.uid(), completed_at = now()
   WHERE id = p_request_id;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'request.cancelled', 'request', p_request_id, '{}'::jsonb);
  RETURN p_request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_request(uuid) TO authenticated, service_role;

-- 6) Retire the weaker duplicate purchase write path. The idempotent
-- inventory_record_purchase RPC is the only supported purchase writer.
DROP FUNCTION IF EXISTS public.purchase_create(uuid, date, text, jsonb);
