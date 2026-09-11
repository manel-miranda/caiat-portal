CREATE OR REPLACE FUNCTION public.guest_token_generate(p_stay_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- 24 random bytes = 192 bits of entropy. pgcrypto lives in the extensions schema.
  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  INSERT INTO public.guest_access_tokens (stay_id, token, created_by)
  VALUES (p_stay_id, v_token, auth.uid());

  RETURN v_token;
END;
$function$;

REVOKE ALL ON FUNCTION public.guest_token_generate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guest_token_generate(uuid) TO authenticated, service_role;