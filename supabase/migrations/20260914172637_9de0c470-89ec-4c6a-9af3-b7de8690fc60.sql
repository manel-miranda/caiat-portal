CREATE TABLE IF NOT EXISTS public.inventory_simulation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario text NOT NULL,
  days integer NOT NULL DEFAULT 7,
  meals integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.inventory_simulation_runs TO authenticated;
GRANT ALL ON public.inventory_simulation_runs TO service_role;

ALTER TABLE public.inventory_simulation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read simulation runs" ON public.inventory_simulation_runs;
CREATE POLICY "Admins read simulation runs"
  ON public.inventory_simulation_runs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.inventory_simulate_week(p_run_id uuid, p_scenario text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_factor numeric;
  v_meals integer := 0;
  v_days integer := 7;
  v_summary jsonb;
  v_existing jsonb;
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

  v_factor := CASE p_scenario
    WHEN 'quiet' THEN 0.8
    WHEN 'normal' THEN 1.8
    WHEN 'busy' THEN 3.2
    WHEN 'stress' THEN 6.0
    ELSE NULL
  END;

  IF v_factor IS NULL THEN
    RAISE EXCEPTION 'SCENARIO_INVALID';
  END IF;

  CREATE TEMP TABLE _sim_portions ON COMMIT DROP AS
  SELECT d.day,
         st.id AS service_type_id,
         greatest(0, floor(random() * 2 * v_factor)::int) AS portions
    FROM generate_series(1, v_days) AS d(day)
    CROSS JOIN (
      SELECT DISTINCT st.id
        FROM public.service_types st
        JOIN public.inventory_recipe_components rc ON rc.service_type_id = st.id
       WHERE st.key LIKE 'demo\_%'
    ) AS st;

  SELECT coalesce(sum(portions), 0) INTO v_meals FROM _sim_portions;

  IF v_meals = 0 THEN
    UPDATE _sim_portions SET portions = 1 WHERE day = 1;
    SELECT coalesce(sum(portions), 0) INTO v_meals FROM _sim_portions;
  END IF;

  CREATE TEMP TABLE _sim_before ON COMMIT DROP AS
  SELECT id, estimated_stock, status FROM public.inventory_status;

  CREATE TEMP TABLE _sim_used ON COMMIT DROP AS
  SELECT rc.inventory_item_id AS item_id,
         round(sum(rc.qty_per_portion * p.portions), 4) AS used
    FROM _sim_portions p
    JOIN public.inventory_recipe_components rc ON rc.service_type_id = p.service_type_id
    JOIN public.inventory_items i ON i.id = rc.inventory_item_id AND i.active = true
   WHERE p.portions > 0
   GROUP BY rc.inventory_item_id
  HAVING sum(rc.qty_per_portion * p.portions) > 0;

  INSERT INTO public.inventory_movements(
    inventory_item_id, movement_type, quantity, notes, source_type, source_id, created_by
  )
  SELECT u.item_id,
         'consumption',
         -u.used,
         '[SIM] ' || p_scenario || ' · ' || v_days || 'd · ' || v_meals || ' meals',
         'simulation',
         p_run_id,
         auth.uid()
    FROM _sim_used u
  ON CONFLICT (source_type, source_id, inventory_item_id)
    WHERE source_id IS NOT NULL
    DO NOTHING;

  SELECT jsonb_build_object(
           'run_id', p_run_id,
           'scenario', p_scenario,
           'days', v_days,
           'meals', v_meals,
           'items', coalesce(jsonb_agg(
             jsonb_build_object(
               'key', a.key,
               'label', a.label,
               'unit', a.unit,
               'consumed', u.used,
               'stock_before', b.estimated_stock,
               'stock_after', a.estimated_stock,
               'status_before', b.status,
               'status_after', a.status,
               'recommended_quantity', a.recommended_quantity
             ) ORDER BY a.label
           ), '[]'::jsonb)
         )
    INTO v_summary
    FROM _sim_used u
    JOIN public.inventory_status a ON a.id = u.item_id
    JOIN _sim_before b ON b.id = u.item_id;

  INSERT INTO public.inventory_simulation_runs(id, scenario, days, meals, summary, created_by)
  VALUES (p_run_id, p_scenario, v_days, v_meals, coalesce(v_summary, '{}'::jsonb), auth.uid());

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'inventory_simulation_run', 'inventory_simulation_run', p_run_id,
          jsonb_build_object('scenario', p_scenario, 'meals', v_meals));

  RETURN coalesce(v_summary, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_simulate_purchase(p_purchase_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lines jsonb;
  v_count integer;
  v_total numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  IF p_purchase_id IS NULL THEN
    RAISE EXCEPTION 'PURCHASE_ID_REQUIRED';
  END IF;

  IF EXISTS (SELECT 1 FROM public.purchases WHERE id = p_purchase_id) THEN
    RETURN jsonb_build_object('purchase_id', p_purchase_id, 'lines', 0, 'total', 0);
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
           'inventory_item_id', s.id,
           'quantity', round(s.recommended_quantity, 3),
           'unit_cost', coalesce(c.last_unit_cost, 0)
         )),
         count(*),
         coalesce(sum(round(round(s.recommended_quantity, 3) * coalesce(c.last_unit_cost, 0), 2)), 0)
    INTO v_lines, v_count, v_total
    FROM public.inventory_status s
    LEFT JOIN public.inventory_purchase_context c ON c.inventory_item_id = s.id
   WHERE s.active = true
     AND round(s.recommended_quantity, 3) > 0;

  IF v_lines IS NULL THEN
    RAISE EXCEPTION 'SIM_NOTHING_TO_BUY';
  END IF;

  PERFORM public.inventory_record_purchase(
    p_purchase_id,
    NULL,
    now(),
    '[SIM] simulated replenishment',
    v_lines
  );

  RETURN jsonb_build_object('purchase_id', p_purchase_id, 'lines', v_count, 'total', v_total);
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_simulation_reset()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movements integer := 0;
  v_purchase_movements integer := 0;
  v_purchases integer := 0;
  v_runs integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  WITH deleted AS (
    DELETE FROM public.inventory_movements
     WHERE source_type = 'simulation'
     RETURNING 1
  )
  SELECT count(*) INTO v_movements FROM deleted;

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
    DELETE FROM public.inventory_simulation_runs RETURNING 1
  )
  SELECT count(*) INTO v_runs FROM deleted;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'inventory_simulation_reset', 'inventory_simulation_run', NULL,
          jsonb_build_object('movements', v_movements + v_purchase_movements,
                             'purchases', v_purchases, 'runs', v_runs));

  RETURN jsonb_build_object(
    'movements', v_movements + v_purchase_movements,
    'purchases', v_purchases,
    'runs', v_runs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_simulate_week(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_simulate_purchase(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_simulation_reset() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_simulate_week(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inventory_simulate_purchase(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inventory_simulation_reset() TO authenticated, service_role;