-- Opt-in fictional cost history. Installing this migration does NOT insert data.
-- Only the database owner can run this non-exposed, invoker-rights helper.
CREATE SCHEMA finance_sample_private;
REVOKE ALL ON SCHEMA finance_sample_private FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION finance_sample_private.seed_history() RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  supplier record;
  batch integer;
  purchase_id uuid;
  supplier_id uuid;
  purchased timestamptz;
  inserted integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(627318492);
  -- Serialize with ordinary purchase writes so a newly entered price wins.
  LOCK TABLE public.purchases, public.purchase_lines IN SHARE ROW EXCLUSIVE MODE;
  CREATE TEMP TABLE finance_seed_items ON COMMIT DROP AS
  SELECT i.id, v.cost, v.supplier,
    CASE WHEN i.unit = 'unit' THEN 24::numeric ELSE 5::numeric END AS quantity
  FROM (VALUES
    ('demo_almonds', 95, 'Pantry'), ('demo_bottled_water', 4, 'Pantry'),
    ('demo_bread', 3, 'Bakery'), ('demo_butter', 85, 'Dairy and meat'),
    ('demo_carrots', 7, 'Produce'), ('demo_chicken', 38, 'Dairy and meat'),
    ('demo_chickpeas', 22, 'Pantry'), ('demo_coffee', 110, 'Pantry'),
    ('demo_eggs', 1.5, 'Dairy and meat'), ('demo_flour', 8, 'Pantry'),
    ('demo_garlic', 25, 'Produce'), ('demo_green_tea', 70, 'Pantry'),
    ('demo_herbs', 20, 'Produce'), ('demo_honey', 90, 'Pantry'),
    ('demo_lemons', 9, 'Produce'), ('demo_lentils', 20, 'Pantry'),
    ('demo_milk', 9, 'Dairy and meat'), ('demo_minced_beef', 95, 'Dairy and meat'),
    ('demo_mint', 15, 'Produce'), ('demo_olive_oil', 75, 'Pantry'),
    ('demo_olives', 30, 'Produce'), ('demo_onions', 6, 'Produce'),
    ('demo_oranges', 8, 'Produce'), ('demo_red_potatoes', 8, 'Produce'),
    ('demo_seasonal_fruit', 14, 'Produce'), ('demo_semolina', 12, 'Pantry'),
    ('demo_sesame', 45, 'Pantry'), ('demo_spices', 100, 'Pantry'),
    ('demo_sugar', 8, 'Pantry'), ('demo_tomatoes', 7, 'Produce'),
    ('demo_turnips', 6, 'Produce'), ('demo_white_potatoes', 7, 'Produce'),
    ('demo_zucchini', 9, 'Produce')
  ) AS v(key, cost, supplier)
  JOIN public.inventory_items i ON i.key = v.key AND i.active
  LEFT JOIN public.inventory_purchase_context c ON c.inventory_item_id = i.id
  WHERE c.last_unit_cost IS NULL
    AND (c.last_purchased_at IS NULL OR c.last_purchased_at <= now())
    AND NOT EXISTS (
      SELECT 1 FROM public.purchase_lines pl JOIN public.purchases p ON p.id = pl.purchase_id
      WHERE pl.inventory_item_id = i.id AND p.notes LIKE '[FICTIONAL FINANCE V1]%'
    );

  FOR supplier IN SELECT DISTINCT f.supplier AS name FROM pg_temp.finance_seed_items f LOOP
    SELECT s.id INTO supplier_id FROM public.suppliers s
      WHERE s.name = '[FICTIONAL] ' || supplier.name || ' supplier'
        AND s.notes = 'Fictional finance sample V1; not a real trading partner.' LIMIT 1;
    IF supplier_id IS NULL THEN
      INSERT INTO public.suppliers(name, location, notes)
      VALUES ('[FICTIONAL] ' || supplier.name || ' supplier', 'Sample data',
        'Fictional finance sample V1; not a real trading partner.') RETURNING id INTO supplier_id;
    END IF;
    FOR batch IN 0..5 LOOP
      purchased := now() - make_interval(days => 30 - batch * 6);
      INSERT INTO public.purchases(supplier_id, purchased_at, purchase_date, notes, total_cost, line_count)
      SELECT supplier_id, purchased, purchased::date,
        '[FICTIONAL FINANCE V1] Historical cost sample only; already consumed before opening stock. No stock receipt or payment.',
        sum(f.quantity * round(f.cost * (0.90 + batch * 0.02), 2)), count(*)
      FROM pg_temp.finance_seed_items f WHERE f.supplier = supplier.name
      RETURNING id INTO purchase_id;
      INSERT INTO public.purchase_lines(purchase_id, inventory_item_id, quantity, unit_cost, line_total)
      SELECT purchase_id, f.id, f.quantity, round(f.cost * (0.90 + batch * 0.02), 2),
        f.quantity * round(f.cost * (0.90 + batch * 0.02), 2)
      FROM pg_temp.finance_seed_items f WHERE f.supplier = supplier.name;
      inserted := inserted + 1;
    END LOOP;
  END LOOP;
  DROP TABLE pg_temp.finance_seed_items;
  RETURN inserted;
END $$;
REVOKE ALL ON FUNCTION finance_sample_private.seed_history() FROM PUBLIC, anon, authenticated, service_role;

-- Upgrade an already-installed public demo without running its destructive reset.
-- Fresh demo installs call the helper directly in scripts/demo/install.sql.
DO $$
DECLARE definition text; anchor text := 'FROM public.inventory_items WHERE active;';
BEGIN
  IF to_regprocedure('demo_private.reset()') IS NOT NULL THEN
    definition := pg_get_functiondef('demo_private.reset()'::regprocedure);
    IF position('finance_sample_private.seed_history()' IN definition) = 0 THEN
      IF (length(definition) - length(replace(definition, anchor, ''))) <> length(anchor) THEN
        RAISE EXCEPTION 'Unexpected demo reset definition; review before upgrading';
      END IF;
      EXECUTE replace(definition, anchor, anchor || E'\n  PERFORM finance_sample_private.seed_history();');
    END IF;
  END IF;
END $$;
