CREATE OR REPLACE FUNCTION public.inventory_simulation_reset()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_movements integer := 0;
  v_purchase_movements integer := 0;
  v_lines integer := 0;
  v_purchases integer := 0;
  v_runs integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  WITH deleted AS (
    DELETE FROM public.inventory_movements
     WHERE source_type IN ('simulation', 'simulation_history')
     RETURNING 1
  )
  SELECT count(*) INTO v_movements FROM deleted;

  WITH deleted AS (
    DELETE FROM public.purchase_lines
     WHERE purchase_id IN (SELECT id FROM public.purchases WHERE notes LIKE '[SIM]%')
     RETURNING 1
  )
  SELECT count(*) INTO v_lines FROM deleted;

  WITH deleted AS (
    DELETE FROM public.inventory_movements
     WHERE source_type = 'purchase'
       AND source_id IN (SELECT id FROM public.purchases WHERE notes LIKE '[SIM]%')
     RETURNING 1
  )
  SELECT count(*) INTO v_purchase_movements FROM deleted;

  WITH deleted AS (
    DELETE FROM public.purchases WHERE notes LIKE '[SIM]%' RETURNING 1
  )
  SELECT count(*) INTO v_purchases FROM deleted;

  WITH deleted AS (
    DELETE FROM public.inventory_simulation_runs WHERE id IS NOT NULL RETURNING 1
  )
  SELECT count(*) INTO v_runs FROM deleted;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'inventory_simulation_reset', 'inventory_simulation_run', NULL,
          jsonb_build_object('movements', v_movements + v_purchase_movements,
                             'purchase_lines', v_lines,
                             'purchases', v_purchases, 'runs', v_runs));

  RETURN jsonb_build_object(
    'movements', v_movements + v_purchase_movements,
    'purchases', v_purchases,
    'runs', v_runs
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.inventory_simulate_history(p_run_id uuid, p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 60);
  v_existing jsonb;
  v_meals integer := 0;
  v_supplier_ids uuid[];
  v_supplier_id uuid;
  v_name text;
  v_purchase_id uuid;
  v_lines jsonb;
  v_ts timestamptz;
  v_k integer;
  v_purchases integer := 0;
  v_total numeric := 0;
  v_purchase_total numeric;
  v_summary jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  IF p_run_id IS NULL THEN
    RAISE EXCEPTION 'RUN_ID_REQUIRED';
  END IF;

  SELECT summary INTO v_existing FROM public.inventory_simulation_runs WHERE id = p_run_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  FOREACH v_name IN ARRAY ARRAY[
    '[DEMO] Chefchaouen Produce Market',
    '[DEMO] Mountain Bakery',
    '[DEMO] Tetouan Meat & Poultry',
    '[DEMO] Pantry & Drinks Wholesale'
  ] LOOP
    SELECT id INTO v_supplier_id FROM public.suppliers WHERE name = v_name LIMIT 1;
    IF v_supplier_id IS NULL THEN
      INSERT INTO public.suppliers(name, location, notes, active, created_by)
      VALUES (v_name, 'Demo data', 'Fictional supplier used for testing', true, auth.uid())
      RETURNING id INTO v_supplier_id;
    END IF;
    v_supplier_ids := coalesce(v_supplier_ids, ARRAY[]::uuid[]) || v_supplier_id;
  END LOOP;

  CREATE TEMP TABLE _hist_cost ON COMMIT DROP AS
  SELECT i.id AS item_id,
         i.key,
         i.label,
         i.unit,
         CASE
           WHEN i.unit = 'unit' THEN round((1.5 + (abs(hashtext(i.key)) % 8))::numeric, 2)
           ELSE round((6 + (abs(hashtext(i.key)) % 55))::numeric, 2)
         END AS unit_cost
    FROM public.inventory_items i
   WHERE i.active = true;

  CREATE TEMP TABLE _hist_portions ON COMMIT DROP AS
  SELECT d.day,
         st.id AS service_type_id,
         greatest(0, floor(random() * 3)::int) AS portions
    FROM generate_series(1, v_days) AS d(day)
    CROSS JOIN (
      SELECT DISTINCT st.id
        FROM public.service_types st
        JOIN public.inventory_recipe_components rc ON rc.service_type_id = st.id
       WHERE st.key LIKE 'demo\_%'
    ) AS st;

  SELECT coalesce(sum(portions), 0) INTO v_meals FROM _hist_portions;
  IF v_meals = 0 THEN
    UPDATE _hist_portions SET portions = 1 WHERE day = 1;
    SELECT coalesce(sum(portions), 0) INTO v_meals FROM _hist_portions;
  END IF;

  CREATE TEMP TABLE _hist_used ON COMMIT DROP AS
  SELECT p.day,
         rc.inventory_item_id AS item_id,
         round(sum(rc.qty_per_portion * p.portions), 4) AS used
    FROM _hist_portions p
    JOIN public.inventory_recipe_components rc ON rc.service_type_id = p.service_type_id
    JOIN public.inventory_items i ON i.id = rc.inventory_item_id AND i.active = true
   WHERE p.portions > 0
   GROUP BY p.day, rc.inventory_item_id
  HAVING sum(rc.qty_per_portion * p.portions) > 0;

  INSERT INTO public.inventory_movements(
    inventory_item_id, movement_type, quantity, notes, source_type, source_id, created_by, created_at
  )
  SELECT u.item_id,
         'consumption',
         -u.used,
         '[SIM] demo history day -' || (v_days - u.day),
         'simulation_history',
         md5(p_run_id::text || ':day:' || u.day)::uuid,
         auth.uid(),
         (now() - make_interval(days => (v_days - u.day)))
    FROM _hist_used u
  ON CONFLICT (source_type, source_id, inventory_item_id)
    WHERE source_id IS NOT NULL
    DO NOTHING;

  FOR v_k IN 0..5 LOOP
    v_ts := now() - make_interval(days => (v_days - v_k * 5));
    v_purchase_id := md5(p_run_id::text || ':purchase:' || v_k)::uuid;
    v_supplier_id := v_supplier_ids[(v_k % 4) + 1];

    SELECT jsonb_agg(jsonb_build_object(
             'inventory_item_id', t.item_id,
             'quantity', t.quantity,
             'unit_cost', t.unit_cost
           )),
           coalesce(sum(round(t.quantity * t.unit_cost, 2)), 0)
      INTO v_lines, v_purchase_total
      FROM (
        SELECT u.item_id,
               round(sum(u.used) * 1.05 / 6.0, 3) AS quantity,
               round(c.unit_cost * (0.92 + (v_k * 0.03)), 2) AS unit_cost
          FROM _hist_used u
          JOIN _hist_cost c ON c.item_id = u.item_id
         GROUP BY u.item_id, c.unit_cost
        HAVING round(sum(u.used) * 1.05 / 6.0, 3) > 0
      ) t;

    IF v_lines IS NOT NULL THEN
      PERFORM public.inventory_record_purchase(
        v_purchase_id,
        v_supplier_id,
        v_ts,
        '[SIM] demo history purchase',
        v_lines
      );
      DROP TABLE IF EXISTS _rec_lines;

      UPDATE public.inventory_movements
         SET created_at = v_ts
       WHERE source_type = 'purchase'
         AND source_id = v_purchase_id;

      v_purchases := v_purchases + 1;
      v_total := v_total + coalesce(v_purchase_total, 0);
    END IF;
  END LOOP;

  SELECT jsonb_build_object(
           'run_id', p_run_id,
           'scenario', 'history',
           'days', v_days,
           'meals', v_meals,
           'purchases', v_purchases,
           'total_cost', v_total,
           'items', coalesce(jsonb_agg(
             jsonb_build_object(
               'key', s.key,
               'label', s.label,
               'unit', s.unit,
               'consumed', t.consumed,
               'stock_before', s.estimated_stock,
               'stock_after', s.estimated_stock,
               'status_before', s.status,
               'status_after', s.status,
               'recommended_quantity', s.recommended_quantity
             ) ORDER BY s.label
           ), '[]'::jsonb)
         )
    INTO v_summary
    FROM (SELECT item_id, round(sum(used), 3) AS consumed FROM _hist_used GROUP BY item_id) t
    JOIN public.inventory_status s ON s.id = t.item_id;

  INSERT INTO public.inventory_simulation_runs(id, scenario, days, meals, summary, created_by)
  VALUES (p_run_id, 'history', v_days, v_meals, coalesce(v_summary, '{}'::jsonb), auth.uid());

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'inventory_simulation_history', 'inventory_simulation_run', p_run_id,
          jsonb_build_object('days', v_days, 'meals', v_meals, 'purchases', v_purchases));

  RETURN coalesce(v_summary, '{}'::jsonb);
END;
$function$;