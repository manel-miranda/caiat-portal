-- Keep curated cross-sells, but surface the strongest-margin option first.
-- Costs remain entirely inside this SECURITY DEFINER function and are never
-- returned to the guest.
CREATE OR REPLACE FUNCTION public.finance_ranked_recommendations(p_service_type_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(r.recommended_service_type_id ORDER BY
           CASE WHEN cost.cost IS NULL OR target.default_price <= 0 THEN 1 ELSE 0 END,
           CASE WHEN cost.cost IS NULL OR target.default_price <= 0 THEN NULL
                ELSE (target.default_price - cost.cost) / target.default_price END DESC NULLS LAST,
           r.position), '[]'::jsonb)
    FROM public.service_recommendations r
    JOIN public.service_types target ON target.id = r.recommended_service_type_id
    LEFT JOIN LATERAL (
      SELECT CASE WHEN count(rc.id) = count(pc.last_unit_cost)
                  THEN sum(rc.qty_per_portion * pc.last_unit_cost)
                  ELSE NULL END AS cost
        FROM public.inventory_recipe_components rc
        LEFT JOIN public.inventory_purchase_context pc ON pc.inventory_item_id = rc.inventory_item_id
       WHERE rc.service_type_id = target.id
    ) cost ON true
   WHERE r.service_type_id = p_service_type_id;
$$;

REVOKE ALL ON FUNCTION public.finance_ranked_recommendations(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_ranked_recommendations(uuid) TO service_role;

-- Re-define the guest RPC so it can call the internal ranking helper without
-- exposing any ingredient or margin fields in its JSON response.
CREATE OR REPLACE FUNCTION public.guest_portal(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stay_id uuid;
  v_stay record;
  v_room record;
  v_guest_name text;
  v_charges jsonb;
  v_requests jsonb;
  v_services jsonb;
  v_demo jsonb;
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
    SELECT jsonb_build_object('id', c.id, 'label', c.label, 'quantity', c.quantity,
                              'total', c.total, 'created_at', c.created_at) AS x, c.total AS t
    FROM public.charges c WHERE c.stay_id = v_stay_id
  ) q;

  SELECT coalesce(sum(p.amount), 0) INTO v_paid FROM public.payments p WHERE p.stay_id = v_stay_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'label', r.label, 'status', r.status,
           'scheduled_at', r.scheduled_at, 'created_at', r.created_at,
           'created_via', r.created_via) ORDER BY r.created_at DESC), '[]'::jsonb)
    INTO v_requests
  FROM public.requests r WHERE r.stay_id = v_stay_id AND r.created_via = 'guest_portal';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', st.id, 'key', st.key, 'label', st.label, 'default_price', st.default_price,
           'billable', st.billable, 'category', st.category, 'guest_category', st.guest_category,
           'guest_subcategory', st.guest_subcategory, 'short_description', st.short_description,
           'name_i18n', st.name_i18n, 'description_i18n', st.description_i18n,
           'activity_mode', st.activity_mode, 'difficulty', st.difficulty,
           'featured', st.featured, 'signature', st.signature, 'available_today', st.available_today,
           'display_order', st.display_order,
           'recommended_ids', public.finance_ranked_recommendations(st.id)
         ) ORDER BY st.display_order, st.sort_order), '[]'::jsonb)
    INTO v_services
  FROM public.service_types st
  WHERE st.active AND st.requestable AND st.guest_visible
    AND NOT st.preview_only AND st.key NOT LIKE 'facility_%';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', st.id, 'key', st.key, 'label', st.label, 'default_price', st.default_price,
           'billable', st.billable, 'category', st.category, 'guest_category', st.guest_category,
           'guest_subcategory', st.guest_subcategory, 'short_description', st.short_description,
           'name_i18n', st.name_i18n, 'description_i18n', st.description_i18n,
           'activity_mode', st.activity_mode, 'difficulty', st.difficulty,
           'featured', st.featured, 'signature', st.signature, 'available_today', st.available_today,
           'display_order', st.display_order,
           'recommended_ids', public.finance_ranked_recommendations(st.id)
         ) ORDER BY st.display_order, st.sort_order), '[]'::jsonb)
    INTO v_demo
  FROM public.service_types st WHERE st.active AND st.preview_only;

  RETURN jsonb_build_object(
    'guest_first_name', v_guest_name, 'room_name', v_room.name, 'room_number', v_room.number,
    'check_in', v_stay.check_in, 'check_out', v_stay.check_out, 'num_guests', v_stay.num_guests,
    'accommodation_total', v_stay.accommodation_total, 'charges', v_charges,
    'charges_total', v_charges_total, 'total', coalesce(v_stay.accommodation_total, 0) + coalesce(v_charges_total, 0),
    'paid', v_paid, 'outstanding', coalesce(v_stay.accommodation_total, 0) + coalesce(v_charges_total, 0) - coalesce(v_paid, 0),
    'requests', v_requests, 'services', v_services, 'demo_services', v_demo
  );
END;
$$;

REVOKE ALL ON FUNCTION public.guest_portal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_portal(text) TO anon, authenticated, service_role;
