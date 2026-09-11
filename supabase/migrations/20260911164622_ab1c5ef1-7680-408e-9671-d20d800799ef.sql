CREATE OR REPLACE FUNCTION public.merge_customers(p_keep_id uuid, p_merge_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_keep public.guests%ROWTYPE;
  v_merge public.guests%ROWTYPE;
  v_notes text;
  v_moved integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(), 'customers_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  IF p_keep_id IS NULL OR p_merge_id IS NULL OR p_keep_id = p_merge_id THEN
    RAISE EXCEPTION 'MERGE_INVALID_TARGET';
  END IF;

  SELECT * INTO v_keep FROM public.guests WHERE id = p_keep_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
  SELECT * INTO v_merge FROM public.guests WHERE id = p_merge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;

  UPDATE public.stays SET guest_id = p_keep_id WHERE guest_id = p_merge_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  v_notes := CASE
    WHEN COALESCE(NULLIF(btrim(v_merge.notes), ''), '') = '' THEN v_keep.notes
    WHEN COALESCE(NULLIF(btrim(v_keep.notes), ''), '') = '' THEN v_merge.notes
    WHEN btrim(v_keep.notes) = btrim(v_merge.notes) THEN v_keep.notes
    ELSE btrim(v_keep.notes) || E'\n---\n' || btrim(v_merge.notes)
  END;

  UPDATE public.guests SET
    full_name = COALESCE(NULLIF(btrim(full_name), ''), NULLIF(btrim(v_merge.full_name), ''), full_name),
    phone = COALESCE(NULLIF(btrim(phone), ''), NULLIF(btrim(v_merge.phone), '')),
    email = COALESCE(NULLIF(btrim(email), ''), NULLIF(btrim(v_merge.email), '')),
    nationality = COALESCE(NULLIF(btrim(nationality), ''), NULLIF(btrim(v_merge.nationality), '')),
    notes = v_notes,
    created_at = LEAST(created_at, v_merge.created_at)
  WHERE id = p_keep_id;

  DELETE FROM public.guests WHERE id = p_merge_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'customer_merged', 'guest', p_keep_id,
          jsonb_build_object('kept_id', p_keep_id, 'merged_id', p_merge_id, 'stays_moved', v_moved));

  RETURN p_keep_id;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_customers(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_customers(uuid, uuid) TO authenticated, service_role;