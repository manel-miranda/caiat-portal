-- Completing a request is a requests permission; creating a financial charge
-- additionally requires payments_manage even though the RPC is SECURITY DEFINER.
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
  IF coalesce(p_with_charge, false)
     AND NOT public.has_permission(auth.uid(), 'payments_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED:payments_manage';
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
