-- ============ 1. TABLES ============
CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  unit text NOT NULL DEFAULT 'unit' CHECK (unit IN ('kg','l','unit','pack')),
  active boolean NOT NULL DEFAULT true,
  preview_only boolean NOT NULL DEFAULT false,
  safety_stock numeric NOT NULL DEFAULT 0 CHECK (safety_stock >= 0),
  target_days integer NOT NULL DEFAULT 4 CHECK (target_days > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read inventory items" ON public.inventory_items
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.inventory_recipe_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type_id uuid NOT NULL REFERENCES public.service_types(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  qty_per_portion numeric NOT NULL CHECK (qty_per_portion > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_type_id, inventory_item_id)
);
GRANT SELECT ON public.inventory_recipe_components TO authenticated;
GRANT ALL ON public.inventory_recipe_components TO service_role;
ALTER TABLE public.inventory_recipe_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read recipes" ON public.inventory_recipe_components
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (movement_type IN ('receipt','consumption','adjustment','waste')),
  quantity numeric NOT NULL,
  unit_cost numeric CHECK (unit_cost IS NULL OR unit_cost >= 0),
  notes text,
  source_type text NOT NULL DEFAULT 'manual',
  source_id uuid,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read movements" ON public.inventory_movements
  FOR SELECT TO authenticated USING (true);

-- Idempotency: one movement per (source, item).
CREATE UNIQUE INDEX inventory_movements_source_unique
  ON public.inventory_movements (source_type, source_id, inventory_item_id)
  WHERE source_id IS NOT NULL;
CREATE INDEX inventory_movements_item_idx
  ON public.inventory_movements (inventory_item_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.inventory_items_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;

CREATE TRIGGER inventory_items_touch_trg BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.inventory_items_touch();

-- ============ 2. FORECAST VIEW ============
CREATE VIEW public.inventory_status
WITH (security_invoker = on) AS
WITH totals AS (
  SELECT i.id,
         COALESCE(SUM(m.quantity), 0)::numeric AS estimated_stock,
         COALESCE(SUM(CASE WHEN m.movement_type = 'consumption'
                            AND m.created_at >= now() - interval '14 days'
                           THEN -m.quantity ELSE 0 END), 0)::numeric AS used_14d
    FROM public.inventory_items i
    LEFT JOIN public.inventory_movements m ON m.inventory_item_id = i.id
   GROUP BY i.id
)
SELECT i.id, i.key, i.label, i.unit, i.active, i.preview_only,
       i.safety_stock, i.target_days, i.notes,
       t.estimated_stock,
       (t.used_14d / 14.0) AS avg_daily_usage,
       CASE WHEN t.used_14d > 0
            THEN t.estimated_stock / (t.used_14d / 14.0) END AS days_remaining,
       CASE
         WHEN t.estimated_stock <= i.safety_stock THEN 'buy'
         WHEN t.used_14d > 0 AND (t.estimated_stock - i.safety_stock) / (t.used_14d / 14.0) < 1 THEN 'buy'
         WHEN t.used_14d > 0 AND t.estimated_stock / (t.used_14d / 14.0) < 3 THEN 'low'
         WHEN t.estimated_stock < i.safety_stock * 1.5 THEN 'low'
         ELSE 'good'
       END AS status,
       GREATEST(0, i.target_days * (t.used_14d / 14.0) + i.safety_stock - t.estimated_stock) AS recommended_quantity
  FROM public.inventory_items i
  JOIN totals t ON t.id = i.id;
GRANT SELECT ON public.inventory_status TO authenticated;
GRANT SELECT ON public.inventory_status TO service_role;

-- ============ 3. WRITE RPCs ============
CREATE OR REPLACE FUNCTION public.inventory_upsert_item(
  p_id uuid, p_key text, p_label text, p_unit text,
  p_safety_stock numeric, p_target_days integer,
  p_active boolean, p_preview_only boolean, p_notes text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_key text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  v_key := lower(trim(coalesce(p_key, '')));
  IF v_key !~ '^[a-z0-9_]{2,60}$' THEN RAISE EXCEPTION 'KEY_INVALID'; END IF;
  IF coalesce(trim(p_label), '') = '' THEN RAISE EXCEPTION 'LABEL_REQUIRED'; END IF;
  IF p_unit NOT IN ('kg','l','unit','pack') THEN RAISE EXCEPTION 'UNIT_INVALID'; END IF;

  IF p_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.inventory_items WHERE key = v_key) THEN
      RAISE EXCEPTION 'KEY_TAKEN';
    END IF;
    INSERT INTO public.inventory_items(key, label, unit, safety_stock, target_days, active, preview_only, notes)
    VALUES (v_key, trim(p_label), p_unit, greatest(coalesce(p_safety_stock,0),0),
            greatest(coalesce(p_target_days,4),1), coalesce(p_active,true),
            coalesce(p_preview_only,true), nullif(trim(coalesce(p_notes,'')),''))
    RETURNING id INTO v_id;
  ELSE
    IF EXISTS (SELECT 1 FROM public.inventory_items WHERE key = v_key AND id <> p_id) THEN
      RAISE EXCEPTION 'KEY_TAKEN';
    END IF;
    UPDATE public.inventory_items
       SET key = v_key, label = trim(p_label), unit = p_unit,
           safety_stock = greatest(coalesce(p_safety_stock,0),0),
           target_days = greatest(coalesce(p_target_days,4),1),
           active = coalesce(p_active,true),
           preview_only = coalesce(p_preview_only, preview_only),
           notes = nullif(trim(coalesce(p_notes,'')),'')
     WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  END IF;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'inventory_item_saved', 'inventory_item', v_id,
          jsonb_build_object('key', v_key, 'preview', true));
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.inventory_set_recipe(p_service_type_id uuid, p_components jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.service_types WHERE id = p_service_type_id) THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  DELETE FROM public.inventory_recipe_components WHERE service_type_id = p_service_type_id;

  INSERT INTO public.inventory_recipe_components(service_type_id, inventory_item_id, qty_per_portion)
  SELECT p_service_type_id,
         (c->>'inventory_item_id')::uuid,
         (c->>'qty_per_portion')::numeric
    FROM jsonb_array_elements(coalesce(p_components, '[]'::jsonb)) AS c
   WHERE (c->>'qty_per_portion')::numeric > 0
  ON CONFLICT (service_type_id, inventory_item_id) DO UPDATE
     SET qty_per_portion = EXCLUDED.qty_per_portion, updated_at = now();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'inventory_recipe_saved', 'service_type', p_service_type_id,
          jsonb_build_object('components', v_count, 'preview', true));
  RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION public.inventory_receive(
  p_item_id uuid, p_quantity numeric, p_unit_cost numeric, p_notes text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(), 'requests_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'QUANTITY_INVALID'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE id = p_item_id) THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  INSERT INTO public.inventory_movements(inventory_item_id, movement_type, quantity, unit_cost, notes, source_type, created_by)
  VALUES (p_item_id, 'receipt', p_quantity,
          CASE WHEN p_unit_cost IS NULL OR p_unit_cost < 0 THEN NULL ELSE p_unit_cost END,
          nullif(trim(coalesce(p_notes,'')),''), 'manual', auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'inventory_receipt', 'inventory_item', p_item_id,
          jsonb_build_object('quantity', p_quantity, 'preview', true));
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.inventory_adjust(
  p_item_id uuid, p_actual_quantity numeric, p_notes text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_current numeric; v_delta numeric; v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(), 'requests_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  IF p_actual_quantity IS NULL OR p_actual_quantity < 0 THEN RAISE EXCEPTION 'QUANTITY_INVALID'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE id = p_item_id) THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_current
    FROM public.inventory_movements WHERE inventory_item_id = p_item_id;
  v_delta := p_actual_quantity - v_current;
  IF v_delta = 0 THEN RAISE EXCEPTION 'NO_CHANGE'; END IF;

  INSERT INTO public.inventory_movements(inventory_item_id, movement_type, quantity, notes, source_type, created_by)
  VALUES (p_item_id, 'adjustment', v_delta, nullif(trim(coalesce(p_notes,'')),''), 'manual', auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'inventory_adjustment', 'inventory_item', p_item_id,
          jsonb_build_object('from', v_current, 'to', p_actual_quantity, 'delta', v_delta, 'preview', true));
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.inventory_waste(
  p_item_id uuid, p_quantity numeric, p_notes text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(), 'requests_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'QUANTITY_INVALID'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE id = p_item_id) THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  INSERT INTO public.inventory_movements(inventory_item_id, movement_type, quantity, notes, source_type, created_by)
  VALUES (p_item_id, 'waste', -p_quantity, nullif(trim(coalesce(p_notes,'')),''), 'manual', auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'inventory_waste', 'inventory_item', p_item_id,
          jsonb_build_object('quantity', p_quantity, 'preview', true));
  RETURN v_id;
END; $$;

-- Idempotent consumption for a delivered PREVIEW food order.
CREATE OR REPLACE FUNCTION public.inventory_consume_preview_order(p_order_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_count integer := 0;
BEGIN
  INSERT INTO public.inventory_movements(
    inventory_item_id, movement_type, quantity, notes, source_type, source_id, created_by)
  SELECT rc.inventory_item_id,
         'consumption',
         -1 * SUM(oi.quantity * rc.qty_per_portion),
         'preview food order',
         'preview_food_order',
         p_order_id,
         auth.uid()
    FROM public.preview_food_order_items oi
    JOIN public.inventory_recipe_components rc ON rc.service_type_id = oi.service_type_id
   WHERE oi.order_id = p_order_id
   GROUP BY rc.inventory_item_id
  ON CONFLICT (source_type, source_id, inventory_item_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

-- Extend the existing status RPC: first transition to delivered consumes stock.
CREATE OR REPLACE FUNCTION public.preview_food_order_set_status(p_order_id uuid, p_status text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_old text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'requests_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  IF p_status NOT IN ('requested','accepted','preparing','ready','delivered','cancelled') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  SELECT status INTO v_old FROM public.preview_food_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  UPDATE public.preview_food_orders
     SET status = p_status, updated_by = auth.uid()
   WHERE id = p_order_id;

  -- Estimated ingredient consumption, exactly once per order (unique source index).
  IF p_status = 'delivered' THEN
    PERFORM public.inventory_consume_preview_order(p_order_id);
  END IF;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'preview_food_order_status', 'preview_food_order', p_order_id,
          jsonb_build_object('from', v_old, 'to', p_status, 'preview', true));
  RETURN p_order_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.inventory_upsert_item(uuid,text,text,text,numeric,integer,boolean,boolean,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_set_recipe(uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_receive(uuid,numeric,numeric,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_adjust(uuid,numeric,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_waste(uuid,numeric,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_consume_preview_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_upsert_item(uuid,text,text,text,numeric,integer,boolean,boolean,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inventory_set_recipe(uuid,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inventory_receive(uuid,numeric,numeric,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inventory_adjust(uuid,numeric,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inventory_waste(uuid,numeric,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inventory_consume_preview_order(uuid) TO authenticated, service_role;

-- ============ 4. DEMO SEED (preview_only) ============
INSERT INTO public.inventory_items(key, label, unit, preview_only, safety_stock, target_days) VALUES
  ('demo_oranges','[DEMO] Oranges','kg',true,5,4),
  ('demo_red_potatoes','[DEMO] Red potatoes','kg',true,4,5),
  ('demo_white_potatoes','[DEMO] White potatoes','kg',true,4,5),
  ('demo_chicken','[DEMO] Chicken','kg',true,3,3),
  ('demo_minced_beef','[DEMO] Minced beef','kg',true,2,3),
  ('demo_eggs','[DEMO] Eggs','unit',true,24,4),
  ('demo_tomatoes','[DEMO] Tomatoes','kg',true,3,4),
  ('demo_onions','[DEMO] Onions','kg',true,3,5),
  ('demo_bread','[DEMO] Bread','unit',true,10,2),
  ('demo_milk','[DEMO] Milk','l',true,4,4),
  ('demo_coffee','[DEMO] Coffee','kg',true,1,10),
  ('demo_mint','[DEMO] Fresh mint','kg',true,0.5,3),
  ('demo_olives','[DEMO] Olives','kg',true,1,7),
  ('demo_lemons','[DEMO] Lemons','kg',true,1,5),
  ('demo_honey','[DEMO] Honey','kg',true,1,14),
  ('demo_seasonal_fruit','[DEMO] Seasonal fruit','kg',true,3,3),
  ('demo_bottled_water','[DEMO] Bottled water','unit',true,24,5),
  ('demo_semolina','[DEMO] Semolina / couscous','kg',true,2,10),
  ('demo_chickpeas','[DEMO] Chickpeas','kg',true,1,10),
  ('demo_lentils','[DEMO] Lentils','kg',true,1,10),
  ('demo_sugar','[DEMO] Sugar','kg',true,2,10);

INSERT INTO public.inventory_recipe_components(service_type_id, inventory_item_id, qty_per_portion)
SELECT s.id, i.id, v.qty
FROM (VALUES
  ('demo_orange_juice','demo_oranges',0.30),
  ('demo_moroccan_breakfast','demo_eggs',2),
  ('demo_moroccan_breakfast','demo_bread',1),
  ('demo_moroccan_breakfast','demo_honey',0.03),
  ('demo_moroccan_breakfast','demo_milk',0.20),
  ('demo_moroccan_breakfast','demo_seasonal_fruit',0.15),
  ('demo_kefta_tajine','demo_minced_beef',0.25),
  ('demo_kefta_tajine','demo_tomatoes',0.30),
  ('demo_kefta_tajine','demo_onions',0.10),
  ('demo_kefta_tajine','demo_eggs',1),
  ('demo_chicken_tajine','demo_chicken',0.35),
  ('demo_chicken_tajine','demo_white_potatoes',0.20),
  ('demo_chicken_tajine','demo_onions',0.10),
  ('demo_chicken_tajine','demo_lemons',0.05),
  ('demo_chicken_tajine','demo_olives',0.05),
  ('demo_couscous','demo_semolina',0.15),
  ('demo_couscous','demo_onions',0.10),
  ('demo_couscous','demo_tomatoes',0.15),
  ('demo_couscous','demo_red_potatoes',0.15),
  ('demo_harira','demo_tomatoes',0.20),
  ('demo_harira','demo_chickpeas',0.05),
  ('demo_harira','demo_lentils',0.05),
  ('demo_mint_tea','demo_mint',0.02),
  ('demo_mint_tea','demo_sugar',0.03),
  ('demo_vegetable_tajine','demo_red_potatoes',0.20),
  ('demo_vegetable_tajine','demo_tomatoes',0.15),
  ('demo_vegetable_tajine','demo_onions',0.10),
  ('demo_grilled_chicken','demo_chicken',0.30),
  ('demo_grilled_chicken','demo_white_potatoes',0.20),
  ('demo_moroccan_salad','demo_tomatoes',0.15),
  ('demo_moroccan_salad','demo_onions',0.05),
  ('demo_fruit_plate','demo_seasonal_fruit',0.25)
) AS v(service_key, item_key, qty)
JOIN public.service_types s ON s.key = v.service_key
JOIN public.inventory_items i ON i.key = v.item_key
ON CONFLICT (service_type_id, inventory_item_id) DO NOTHING;