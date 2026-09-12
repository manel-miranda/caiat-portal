-- 1. Additive localized fields on the existing catalogue
ALTER TABLE public.service_types
  ADD COLUMN IF NOT EXISTS name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS description_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER service_types_updated_at
  BEFORE UPDATE ON public.service_types
  FOR EACH ROW EXECUTE FUNCTION public.payment_sessions_touch();

-- 2. Curated cross-sells
CREATE TABLE public.service_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type_id uuid NOT NULL REFERENCES public.service_types(id) ON DELETE CASCADE,
  recommended_service_type_id uuid NOT NULL REFERENCES public.service_types(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_recommendations_no_self CHECK (service_type_id <> recommended_service_type_id),
  CONSTRAINT service_recommendations_unique UNIQUE (service_type_id, recommended_service_type_id),
  CONSTRAINT service_recommendations_position CHECK (position BETWEEN 0 AND 2)
);

GRANT SELECT ON public.service_recommendations TO authenticated;
GRANT ALL ON public.service_recommendations TO service_role;

ALTER TABLE public.service_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recommendations read" ON public.service_recommendations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "recommendations admin write" ON public.service_recommendations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER service_recommendations_updated_at
  BEFORE UPDATE ON public.service_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.payment_sessions_touch();

CREATE INDEX service_recommendations_source_idx
  ON public.service_recommendations (service_type_id, position);

-- 3. Admin-only catalogue writes
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
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_key text := lower(btrim(coalesce(p_key, '')));
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
    -- Custom items are namespaced so predefined keys and their translations stay untouched.
    IF EXISTS (SELECT 1 FROM public.service_types WHERE key = v_key) THEN
      RAISE EXCEPTION 'KEY_TAKEN';
    END IF;
    INSERT INTO public.service_types (
      key, label, default_price, billable, requestable, active, guest_visible,
      category, guest_category, guest_subcategory, short_description,
      activity_mode, difficulty, display_order, sort_order, featured, signature,
      name_i18n, description_i18n
    ) VALUES (
      v_key, btrim(p_label), coalesce(p_default_price, 0), coalesce(p_billable, true),
      coalesce(p_requestable, true), coalesce(p_active, true), coalesce(p_guest_visible, true),
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
    VALUES (auth.uid(), 'catalog.created', 'service_type', v_id,
            jsonb_build_object('key', v_key, 'label', btrim(p_label)));
  ELSE
    SELECT to_jsonb(s) - 'id' - 'created_at' - 'updated_at' INTO v_before
      FROM public.service_types s WHERE s.id = p_id;
    IF v_before IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND'; END IF;
    IF EXISTS (SELECT 1 FROM public.service_types WHERE key = v_key AND id <> p_id) THEN
      RAISE EXCEPTION 'KEY_TAKEN';
    END IF;

    UPDATE public.service_types SET
      key = v_key,
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
$$;

CREATE OR REPLACE FUNCTION public.catalog_set_active(p_id uuid, p_active boolean)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED:catalog_manage';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.service_types WHERE id = p_id) THEN
    RAISE EXCEPTION 'SERVICE_NOT_FOUND';
  END IF;

  UPDATE public.service_types SET active = coalesce(p_active, true) WHERE id = p_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(),
          CASE WHEN p_active THEN 'catalog.reactivated' ELSE 'catalog.deactivated' END,
          'service_type', p_id, '{}'::jsonb);
  RETURN p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_set_recommendations(p_id uuid, p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_clean uuid[];
  v_item uuid;
  v_pos integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED:catalog_manage';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.service_types WHERE id = p_id) THEN
    RAISE EXCEPTION 'SERVICE_NOT_FOUND';
  END IF;

  -- De-duplicate, drop self-reference, keep the given order.
  SELECT coalesce(array_agg(x ORDER BY ord), '{}'::uuid[]) INTO v_clean
  FROM (
    SELECT DISTINCT ON (x) x, ord
    FROM unnest(coalesce(p_ids, '{}'::uuid[])) WITH ORDINALITY AS u(x, ord)
    WHERE x <> p_id
    ORDER BY x, ord
  ) d;

  IF coalesce(array_length(v_clean, 1), 0) > 3 THEN RAISE EXCEPTION 'TOO_MANY_RECOMMENDATIONS'; END IF;

  FOREACH v_item IN ARRAY v_clean LOOP
    IF NOT EXISTS (SELECT 1 FROM public.service_types WHERE id = v_item) THEN
      RAISE EXCEPTION 'SERVICE_NOT_FOUND';
    END IF;
  END LOOP;

  DELETE FROM public.service_recommendations WHERE service_type_id = p_id;

  FOREACH v_item IN ARRAY v_clean LOOP
    INSERT INTO public.service_recommendations (service_type_id, recommended_service_type_id, position)
    VALUES (p_id, v_item, v_pos);
    v_pos := v_pos + 1;
  END LOOP;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'catalog.recommendations_set', 'service_type', p_id,
          jsonb_build_object('count', v_pos));

  RETURN v_pos;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.catalog_upsert_service(uuid, text, text, numeric, boolean, boolean, boolean, boolean, text, text, text, text, text, text, integer, integer, boolean, boolean, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.catalog_set_active(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.catalog_set_recommendations(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_upsert_service(uuid, text, text, numeric, boolean, boolean, boolean, boolean, text, text, text, text, text, text, integer, integer, boolean, boolean, jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.catalog_set_active(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.catalog_set_recommendations(uuid, uuid[]) TO authenticated, service_role;

-- 4. Guest portal: expose the localized wording additively
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
           'display_order', st.display_order,
           'recommended_ids', coalesce((
             SELECT jsonb_agg(sr.recommended_service_type_id ORDER BY sr.position)
             FROM public.service_recommendations sr
             WHERE sr.service_type_id = st.id
           ), '[]'::jsonb)
         ) ORDER BY st.display_order, st.sort_order), '[]'::jsonb)
    INTO v_services
  FROM public.service_types st
  WHERE st.active AND st.requestable AND st.guest_visible AND st.key NOT LIKE 'facility_%';

  RETURN jsonb_build_object(
    'guest_first_name', v_guest_name,
    'room_name', v_room.name,
    'room_number', v_room.number,
    'check_in', v_stay.check_in,
    'check_out', v_stay.check_out,
    'num_guests', v_stay.num_guests,
    'status', v_stay.status,
    'confirmation_status', v_stay.confirmation_status,
    'accommodation_total', v_stay.accommodation_total,
    'charges', v_charges,
    'charges_total', v_charges_total,
    'total', coalesce(v_stay.accommodation_total, 0) + v_charges_total,
    'paid', v_paid,
    'outstanding', greatest(0, coalesce(v_stay.accommodation_total, 0) + v_charges_total - v_paid),
    'requests', v_requests,
    'services', v_services
  );
END;
$function$;
