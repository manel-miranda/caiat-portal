ALTER TABLE public.service_types ADD COLUMN IF NOT EXISTS preview_only boolean NOT NULL DEFAULT false;

INSERT INTO public.service_types
  (key, label, default_price, billable, requestable, active, guest_visible, preview_only,
   category, guest_category, guest_subcategory, short_description, display_order, sort_order,
   featured, signature, name_i18n, description_i18n)
VALUES
 ('demo_kefta_tajine','[DEMO] Caiat Kefta Tajine',140,false,false,true,false,true,'demo','food','signature','Beef meatballs, tomato, egg and herbs',10,900,true,true,
  '{"en":"Caiat Kefta Tajine","pt":"Tajine de Kefta Caiat","fr":"Tajine Kefta Caiat","ar":"طاجين الكفتة كايات"}'::jsonb,
  '{"en":"Beef meatballs, tomato, egg and herbs","pt":"Almôndegas de vaca, tomate, ovo e ervas","fr":"Boulettes de bœuf, tomate, œuf et herbes","ar":"كرات لحم البقر والطماطم والبيض والأعشاب"}'::jsonb),
 ('demo_chicken_tajine','[DEMO] Chicken tajine with preserved lemon',130,false,false,true,false,true,'demo','food','mains','Slow-cooked chicken, olives, preserved lemon',11,901,false,false,
  '{"en":"Chicken tajine with preserved lemon","pt":"Tajine de frango com limão em conserva","fr":"Tajine de poulet au citron confit","ar":"طاجين الدجاج بالليمون المخلل"}'::jsonb,
  '{"en":"Slow-cooked chicken, olives, preserved lemon","pt":"Frango cozinhado lentamente, azeitonas, limão","fr":"Poulet mijoté, olives, citron confit","ar":"دجاج مطهو ببطء مع الزيتون والليمون"}'::jsonb),
 ('demo_vegetable_tajine','[DEMO] Vegetable tajine',110,false,false,true,false,true,'demo','food','mains','Seasonal vegetables and mild spices',12,902,false,false,
  '{"en":"Vegetable tajine","pt":"Tajine de legumes","fr":"Tajine de légumes","ar":"طاجين الخضار"}'::jsonb,
  '{"en":"Seasonal vegetables and mild spices","pt":"Legumes da época e especiarias suaves","fr":"Légumes de saison et épices douces","ar":"خضار موسمية وتوابل خفيفة"}'::jsonb),
 ('demo_couscous','[DEMO] Couscous',120,false,false,true,false,true,'demo','food','mains','Semolina, seven vegetables, broth',13,903,false,false,
  '{"en":"Couscous","pt":"Cuscuz","fr":"Couscous","ar":"كسكس"}'::jsonb,
  '{"en":"Semolina, seven vegetables, broth","pt":"Sêmola, sete legumes, caldo","fr":"Semoule, sept légumes, bouillon","ar":"سميد وسبع خضروات ومرق"}'::jsonb),
 ('demo_harira','[DEMO] Harira soup',55,false,false,true,false,true,'demo','food','mains','Tomato, lentils and chickpeas',14,904,false,false,
  '{"en":"Harira soup","pt":"Sopa harira","fr":"Soupe harira","ar":"حريرة"}'::jsonb,
  '{"en":"Tomato, lentils and chickpeas","pt":"Tomate, lentilhas e grão","fr":"Tomate, lentilles et pois chiches","ar":"طماطم وعدس وحمص"}'::jsonb),
 ('demo_moroccan_salad','[DEMO] Moroccan salad',45,false,false,true,false,true,'demo','food','mains','Tomato, cucumber, onion, olive oil',15,905,false,false,
  '{"en":"Moroccan salad","pt":"Salada marroquina","fr":"Salade marocaine","ar":"سلطة مغربية"}'::jsonb,
  '{"en":"Tomato, cucumber, onion, olive oil","pt":"Tomate, pepino, cebola, azeite","fr":"Tomate, concombre, oignon, huile d''olive","ar":"طماطم وخيار وبصل وزيت الزيتون"}'::jsonb),
 ('demo_moroccan_breakfast','[DEMO] Moroccan breakfast',85,false,false,true,false,true,'demo','food','mains','Breads, olive oil, honey, amlou, eggs',16,906,false,false,
  '{"en":"Moroccan breakfast","pt":"Pequeno-almoço marroquino","fr":"Petit-déjeuner marocain","ar":"فطور مغربي"}'::jsonb,
  '{"en":"Breads, olive oil, honey, amlou, eggs","pt":"Pães, azeite, mel, amlou, ovos","fr":"Pains, huile d''olive, miel, amlou, œufs","ar":"خبز وزيت الزيتون والعسل وأملو والبيض"}'::jsonb),
 ('demo_grilled_chicken','[DEMO] Grilled chicken plate',125,false,false,true,false,true,'demo','food','mains','Marinated chicken, fries, salad',17,907,false,false,
  '{"en":"Grilled chicken plate","pt":"Prato de frango grelhado","fr":"Assiette de poulet grillé","ar":"طبق دجاج مشوي"}'::jsonb,
  '{"en":"Marinated chicken, fries, salad","pt":"Frango marinado, batatas, salada","fr":"Poulet mariné, frites, salade","ar":"دجاج متبل مع البطاطس والسلطة"}'::jsonb),
 ('demo_mint_tea','[DEMO] Moroccan mint tea',25,false,false,true,false,true,'demo','food','drinks','Green tea, fresh mint',18,908,false,false,
  '{"en":"Moroccan mint tea","pt":"Chá de menta marroquino","fr":"Thé à la menthe","ar":"أتاي بالنعناع"}'::jsonb,
  '{"en":"Green tea, fresh mint","pt":"Chá verde, menta fresca","fr":"Thé vert, menthe fraîche","ar":"شاي أخضر ونعناع طازج"}'::jsonb),
 ('demo_orange_juice','[DEMO] Fresh orange juice',30,false,false,true,false,true,'demo','food','drinks','Pressed to order',19,909,false,false,
  '{"en":"Fresh orange juice","pt":"Sumo de laranja natural","fr":"Jus d''orange frais","ar":"عصير برتقال طازج"}'::jsonb,
  '{"en":"Pressed to order","pt":"Espremido na hora","fr":"Pressé à la commande","ar":"يُعصر عند الطلب"}'::jsonb),
 ('demo_fruit_plate','[DEMO] Seasonal fruit plate',40,false,false,true,false,true,'demo','food','desserts','Whatever is ripe that day',20,910,false,false,
  '{"en":"Seasonal fruit plate","pt":"Prato de fruta da época","fr":"Assiette de fruits de saison","ar":"طبق فواكه موسمية"}'::jsonb,
  '{"en":"Whatever is ripe that day","pt":"O que estiver maduro nesse dia","fr":"Selon la saison du jour","ar":"حسب فواكه اليوم"}'::jsonb),
 ('demo_pastries','[DEMO] Moroccan pastries',45,false,false,true,false,true,'demo','food','desserts','Almond and honey selection',21,911,false,false,
  '{"en":"Moroccan pastries","pt":"Doces marroquinos","fr":"Pâtisseries marocaines","ar":"حلويات مغربية"}'::jsonb,
  '{"en":"Almond and honey selection","pt":"Seleção de amêndoa e mel","fr":"Sélection amande et miel","ar":"تشكيلة اللوز والعسل"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

WITH pairs(src, tgt, pos) AS (
  VALUES
    ('demo_kefta_tajine','demo_moroccan_salad',0),
    ('demo_kefta_tajine','demo_mint_tea',1),
    ('demo_kefta_tajine','demo_pastries',2),
    ('demo_chicken_tajine','demo_moroccan_salad',0),
    ('demo_chicken_tajine','demo_mint_tea',1),
    ('demo_vegetable_tajine','demo_mint_tea',0),
    ('demo_vegetable_tajine','demo_fruit_plate',1),
    ('demo_couscous','demo_mint_tea',0),
    ('demo_couscous','demo_fruit_plate',1),
    ('demo_harira','demo_pastries',0),
    ('demo_harira','demo_mint_tea',1),
    ('demo_moroccan_salad','demo_mint_tea',0),
    ('demo_moroccan_breakfast','demo_orange_juice',0),
    ('demo_moroccan_breakfast','demo_mint_tea',1),
    ('demo_grilled_chicken','demo_moroccan_salad',0),
    ('demo_grilled_chicken','demo_orange_juice',1),
    ('demo_fruit_plate','demo_mint_tea',0),
    ('demo_pastries','demo_mint_tea',0)
)
INSERT INTO public.service_recommendations (service_type_id, recommended_service_type_id, position)
SELECT s.id, r.id, p.pos
FROM pairs p
JOIN public.service_types s ON s.key = p.src
JOIN public.service_types r ON r.key = p.tgt
ON CONFLICT (service_type_id, recommended_service_type_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.catalog_set_incoming_recommendations(p_id uuid, p_source_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clean uuid[];
  v_src uuid;
  v_pos integer;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED:catalog_manage';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.service_types WHERE id = p_id) THEN
    RAISE EXCEPTION 'SERVICE_NOT_FOUND';
  END IF;

  SELECT coalesce(array_agg(DISTINCT x), '{}'::uuid[]) INTO v_clean
  FROM unnest(coalesce(p_source_ids, '{}'::uuid[])) AS u(x)
  WHERE x <> p_id;

  FOREACH v_src IN ARRAY v_clean LOOP
    IF NOT EXISTS (SELECT 1 FROM public.service_types WHERE id = v_src) THEN
      RAISE EXCEPTION 'SERVICE_NOT_FOUND';
    END IF;
  END LOOP;

  -- Remove this item from sources that are no longer selected.
  DELETE FROM public.service_recommendations
  WHERE recommended_service_type_id = p_id
    AND NOT (service_type_id = ANY (v_clean));

  -- Add this item to newly selected sources, respecting the 3-per-source cap.
  FOREACH v_src IN ARRAY v_clean LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.service_recommendations
      WHERE service_type_id = v_src AND recommended_service_type_id = p_id
    ) THEN
      SELECT count(*) INTO v_pos FROM public.service_recommendations WHERE service_type_id = v_src;
      IF v_pos >= 3 THEN RAISE EXCEPTION 'TOO_MANY_RECOMMENDATIONS'; END IF;
      INSERT INTO public.service_recommendations (service_type_id, recommended_service_type_id, position)
      VALUES (v_src, p_id, v_pos);
    END IF;
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'catalog.incoming_recommendations_set', 'service_type', p_id,
          jsonb_build_object('count', v_count));

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.catalog_set_incoming_recommendations(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_set_incoming_recommendations(uuid, uuid[]) TO authenticated, service_role;

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
  WHERE st.active AND st.requestable AND st.guest_visible
    AND NOT st.preview_only AND st.key NOT LIKE 'facility_%';

  -- Preview-only demo dishes: never part of the real request catalogue. The
  -- client only renders these on preview hosts.
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
    INTO v_demo
  FROM public.service_types st
  WHERE st.active AND st.preview_only;

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
    'services', v_services,
    'demo_services', v_demo
  );
END;
$function$;
