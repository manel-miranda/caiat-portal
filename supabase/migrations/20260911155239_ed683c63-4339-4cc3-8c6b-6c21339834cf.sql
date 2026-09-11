CREATE OR REPLACE FUNCTION public.customer_upsert(p_full_name text, p_phone text, p_email text, p_nationality text, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT (public.has_permission(auth.uid(), 'customers_manage')
          OR public.has_permission(auth.uid(), 'reservations_manage')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED:customers_manage';
  END IF;
  IF coalesce(btrim(p_full_name), '') = '' THEN RAISE EXCEPTION 'GUEST_NAME_REQUIRED'; END IF;

  INSERT INTO public.guests (full_name, phone, email, nationality, notes)
  VALUES (btrim(p_full_name),
          nullif(btrim(coalesce(p_phone, '')), ''),
          nullif(btrim(coalesce(p_email, '')), ''),
          nullif(btrim(coalesce(p_nationality, '')), ''),
          nullif(btrim(coalesce(p_notes, '')), ''))
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'customer.created', 'guest', v_id,
          jsonb_build_object('full_name', btrim(p_full_name)));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_user_permission(p_user_id uuid, p_key text, p_granted boolean DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'PERMISSION_DENIED:roles_manage'; END IF;
  IF p_key IN ('users_manage','roles_manage','pin_reset') THEN
    RAISE EXCEPTION 'PERMISSION_NOT_GRANTABLE';
  END IF;
  IF p_key NOT IN ('reservations_manage','payments_manage','checkout_override','cash_reconcile',
                   'customers_manage','guest_access_manage','requests_manage','activity_view') THEN
    RAISE EXCEPTION 'UNKNOWN_PERMISSION';
  END IF;

  IF p_granted IS NULL THEN
    DELETE FROM public.user_permissions WHERE user_id = p_user_id AND permission = p_key;
  ELSE
    INSERT INTO public.user_permissions (user_id, permission, granted, updated_at)
    VALUES (p_user_id, p_key, p_granted, now())
    ON CONFLICT (user_id, permission) DO UPDATE SET granted = excluded.granted, updated_at = now();
  END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'permission.changed', 'user', p_user_id,
          jsonb_build_object('permission', p_key, 'granted', p_granted));
END;
$function$;

REVOKE ALL ON FUNCTION public.set_user_permission(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_permission(uuid, text, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.customer_upsert(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_upsert(text, text, text, text, text) TO authenticated, service_role;