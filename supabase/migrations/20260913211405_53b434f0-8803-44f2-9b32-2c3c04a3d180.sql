-- Purchases: timestamped, per-line unit cost, idempotent recording, read views.
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS purchased_at timestamptz NOT NULL DEFAULT now();
UPDATE public.purchases SET purchased_at = (purchase_date::timestamptz + interval '12 hours')
 WHERE purchased_at IS NOT NULL AND purchase_date IS NOT NULL AND purchased_at::date <> purchase_date;
ALTER TABLE public.purchases ALTER COLUMN purchase_date SET DEFAULT CURRENT_DATE;
CREATE INDEX IF NOT EXISTS purchases_purchased_at_idx ON public.purchases (purchased_at DESC);

ALTER TABLE public.purchase_lines
  ADD COLUMN IF NOT EXISTS unit_cost numeric CHECK (unit_cost IS NULL OR unit_cost >= 0);
UPDATE public.purchase_lines
   SET unit_cost = CASE WHEN quantity > 0 AND line_total > 0 THEN line_total / quantity END
 WHERE unit_cost IS NULL;

-- Supplier upsert under the inventory naming convention (same rules as supplier_upsert).
CREATE OR REPLACE FUNCTION public.inventory_upsert_supplier(
  p_id uuid, p_name text, p_phone text, p_location text, p_notes text, p_active boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN public.supplier_upsert(p_id, p_name, p_phone, p_location, p_notes, p_active);
END; $$;
REVOKE ALL ON FUNCTION public.inventory_upsert_supplier(uuid, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_upsert_supplier(uuid, text, text, text, text, boolean) TO authenticated, service_role;

-- Atomic + idempotent purchase recording keyed by a client-supplied purchase id.
CREATE OR REPLACE FUNCTION public.inventory_record_purchase(
  p_purchase_id uuid,
  p_supplier_id uuid,
  p_purchased_at timestamptz,
  p_notes text,
  p_lines jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_id uuid := coalesce(p_purchase_id, gen_random_uuid());
  v_count integer;
  v_total numeric;
  v_supplier text;
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(), 'requests_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Idempotent retry: the same purchase id is recorded once and returned unchanged.
  IF EXISTS (SELECT 1 FROM public.purchases WHERE id = v_id) THEN
    RETURN v_id;
  END IF;

  IF p_supplier_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = p_supplier_id) THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  CREATE TEMP TABLE _rec_lines ON COMMIT DROP AS
  SELECT (l->>'inventory_item_id')::uuid AS inventory_item_id,
         (l->>'quantity')::numeric AS quantity,
         coalesce((l->>'unit_cost')::numeric, 0) AS unit_cost
    FROM jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) AS l
   WHERE (l->>'inventory_item_id') IS NOT NULL;

  IF NOT EXISTS (SELECT 1 FROM _rec_lines) THEN
    RAISE EXCEPTION 'LINES_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM _rec_lines WHERE quantity IS NULL OR quantity <= 0) THEN
    RAISE EXCEPTION 'QUANTITY_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM _rec_lines WHERE unit_cost < 0) THEN
    RAISE EXCEPTION 'COST_INVALID';
  END IF;
  IF EXISTS (
    SELECT inventory_item_id FROM _rec_lines GROUP BY inventory_item_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_ITEM';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _rec_lines rl
     WHERE NOT EXISTS (
       SELECT 1 FROM public.inventory_items i WHERE i.id = rl.inventory_item_id AND i.active
     )
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  SELECT count(*), coalesce(sum(round(quantity * unit_cost, 2)), 0)
    INTO v_count, v_total FROM _rec_lines;
  SELECT name INTO v_supplier FROM public.suppliers WHERE id = p_supplier_id;

  INSERT INTO public.purchases(
    id, supplier_id, purchase_date, purchased_at, notes, total_cost, line_count, created_by)
  VALUES (v_id, p_supplier_id,
          coalesce(p_purchased_at, now())::date, coalesce(p_purchased_at, now()),
          v_notes, v_total, v_count, auth.uid());

  INSERT INTO public.purchase_lines(purchase_id, inventory_item_id, quantity, unit_cost, line_total)
  SELECT v_id, inventory_item_id, quantity,
         CASE WHEN unit_cost > 0 THEN unit_cost END,
         round(quantity * unit_cost, 2)
    FROM _rec_lines
  ON CONFLICT (purchase_id, inventory_item_id) DO NOTHING;

  INSERT INTO public.inventory_movements(
    inventory_item_id, movement_type, quantity, unit_cost, notes, source_type, source_id, created_by)
  SELECT rl.inventory_item_id, 'receipt', rl.quantity,
         CASE WHEN rl.unit_cost > 0 THEN rl.unit_cost END,
         coalesce(v_supplier, v_notes),
         'purchase', v_id, auth.uid()
    FROM _rec_lines rl
  ON CONFLICT (source_type, source_id, inventory_item_id)
    WHERE source_id IS NOT NULL
    DO NOTHING;

  DROP TABLE _rec_lines;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'purchase_recorded', 'purchase', v_id,
          jsonb_build_object('lines', v_count, 'total', v_total, 'supplier_id', p_supplier_id));
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.inventory_record_purchase(uuid, uuid, timestamptz, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_record_purchase(uuid, uuid, timestamptz, text, jsonb) TO authenticated, service_role;

-- Read helpers (security_invoker: existing RLS decides visibility).
CREATE OR REPLACE VIEW public.purchase_overview AS
SELECT p.id,
       p.supplier_id,
       s.name AS supplier_name,
       p.purchased_at,
       p.purchase_date,
       p.notes,
       p.total_cost,
       p.line_count,
       p.created_at
  FROM public.purchases p
  LEFT JOIN public.suppliers s ON s.id = p.supplier_id;
ALTER VIEW public.purchase_overview SET (security_invoker = true);
GRANT SELECT ON public.purchase_overview TO authenticated;
GRANT SELECT ON public.purchase_overview TO service_role;

CREATE OR REPLACE VIEW public.inventory_purchase_context AS
SELECT DISTINCT ON (pl.inventory_item_id)
       pl.inventory_item_id,
       p.id AS purchase_id,
       p.purchased_at AS last_purchased_at,
       p.supplier_id AS last_supplier_id,
       s.name AS last_supplier_name,
       pl.unit_cost AS last_unit_cost,
       pl.quantity AS last_quantity
  FROM public.purchase_lines pl
  JOIN public.purchases p ON p.id = pl.purchase_id
  LEFT JOIN public.suppliers s ON s.id = p.supplier_id
 ORDER BY pl.inventory_item_id, p.purchased_at DESC, p.created_at DESC;
ALTER VIEW public.inventory_purchase_context SET (security_invoker = true);
GRANT SELECT ON public.inventory_purchase_context TO authenticated;
GRANT SELECT ON public.inventory_purchase_context TO service_role;