-- Harden catalogue writes now that the catalogue is used in production.
-- New items are always created hidden/inactive and require a second explicit edit to go live.
-- Existing service keys are stable identifiers and may not be renamed.
CREATE OR REPLACE FUNCTION public.catalog_upsert_service(
  p_id uuid,
  p_key text,
  p_label text,
  p_default_price numeric,
  p_billable boolean,
  p_requestable boolean,
  p_active boolean,
  p_guest_visible boolean,
  p_category text,
  p_guest_category text,
  p_guest_subcategory text,
  p_short_description text,
  p_activity_mode text,
  p_difficulty text,
  p_display_order integer,
  p_sort_order integer,
  p_featured boolean,
  p_signature boolean,
  p_name_i18n jsonb DEFAULT '{}'::jsonb,
  p_description_i18n jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_key text := lower(btrim(coalesce(p_key, '')));
  v_existing_key text;
  v_before jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED:catalog_manage';
  END IF;
  IF coalesce(btrim(p_label), '') = '' THEN RAISE EXCEPTION 'LABEL_REQUIRED'; END IF;
  IF coalesce(p_default_price, 0) < 0 THEN RAISE EXCEPTION 'PRICE_NON_NEGATIVE'; END IF;
  IF v_key = '' THEN RAISE EXCEPTION 'KEY_REQUIRED'; END IF;
  IF v_key !~ '^[a-z0-9_]{2,48}$' THEN RAISE EXCEPTION 'KEY_INVALID'; END IF;

  IF p_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.service_types WHERE key = v_key) THEN
      RAISE EXCEPTION 'KEY_TAKEN';
    END IF;

    -- Safety rule: creation never publishes an item in the same operation.
    -- Admins can explicitly enable it in a later edit after reviewing the saved item.
    INSERT INTO public.service_types (
      key, label, default_price, billable, requestable, active, guest_visible,
      category, guest_category, guest_subcategory, short_description,
      activity_mode, difficulty, display_order, sort_order, featured, signature,
      name_i18n, description_i18n
    ) VALUES (
      v_key, btrim(p_label), coalesce(p_default_price, 0), coalesce(p_billable, true),
      false, false, false,
      coalesce(nullif(btrim(coalesce(p_category, '')), ''), 'other'),
      nullif(btrim(coalesce(p_guest_category, '')), ''),
      nullif(btrim(coalesce(p_guest_subcategory, '')), ''),
      nullif(btrim(coalesce(p_short_description, '')), ''),
      nullif(btrim(coalesce(p_activity_mode, '')), ''),
      nullif(btrim(coalesce(p_difficulty, '')), ''),
      coalesce(p_display_order, 0), coalesce(p_sort_order, 0),
      coalesce(p_featured, false), coalesce(p_signature, false),
      coalesce(p_name_i18n, '{}'::jsonb), coalesce(p_description_i18n, '{}'::jsonb)
    ) RETURNING id INTO v_id;

    INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(), 'catalog.created', 'service_type', v_id,
      jsonb_build_object(
        'key', v_key,
        'label', btrim(p_label),
        'safe_defaults', true,
        'requested_active', coalesce(p_active, false),
        'requested_requestable', coalesce(p_requestable, false),
        'requested_guest_visible', coalesce(p_guest_visible, false)
      )
    );
  ELSE
    SELECT s.key, to_jsonb(s) - 'id' - 'created_at' - 'updated_at'
      INTO v_existing_key, v_before
      FROM public.service_types s
     WHERE s.id = p_id;

    IF v_before IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND'; END IF;
    IF v_key <> v_existing_key THEN RAISE EXCEPTION 'KEY_IMMUTABLE'; END IF;

    UPDATE public.service_types SET
      label = btrim(p_label),
      default_price = coalesce(p_default_price, 0),
      billable = coalesce(p_billable, billable),
      requestable = coalesce(p_requestable, requestable),
      active = coalesce(p_active, active),
      guest_visible = coalesce(p_guest_visible, guest_visible),
      category = coalesce(nullif(btrim(coalesce(p_category, '')), ''), category),
      guest_category = nullif(btrim(coalesce(p_guest_category, '')), ''),
      guest_subcategory = nullif(btrim(coalesce(p_guest_subcategory, '')), ''),
      short_description = nullif(btrim(coalesce(p_short_description, '')), ''),
      activity_mode = nullif(btrim(coalesce(p_activity_mode, '')), ''),
      difficulty = nullif(btrim(coalesce(p_difficulty, '')), ''),
      display_order = coalesce(p_display_order, display_order),
      sort_order = coalesce(p_sort_order, sort_order),
      featured = coalesce(p_featured, false),
      signature = coalesce(p_signature, false),
      name_i18n = coalesce(p_name_i18n, '{}'::jsonb),
      description_i18n = coalesce(p_description_i18n, '{}'::jsonb)
    WHERE id = p_id;
    v_id := p_id;

    INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'catalog.updated', 'service_type', v_id,
            jsonb_build_object('before', v_before));
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.catalog_upsert_service(
  uuid,text,text,numeric,boolean,boolean,boolean,boolean,text,text,text,text,text,text,
  integer,integer,boolean,boolean,jsonb,jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_upsert_service(
  uuid,text,text,numeric,boolean,boolean,boolean,boolean,text,text,text,text,text,text,
  integer,integer,boolean,boolean,jsonb,jsonb
) TO authenticated, service_role;
