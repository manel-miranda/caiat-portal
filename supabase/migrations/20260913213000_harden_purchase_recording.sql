-- Harden purchase recording after the initial Suppliers + Purchases migration.
-- The client supplies a stable UUID so retries are idempotent and cannot double stock.

DROP FUNCTION IF EXISTS public.purchase_create(uuid, date, text, jsonb);

CREATE OR REPLACE FUNCTION public.purchase_create(
  p_purchase_id uuid,
  p_supplier_id uuid,
  p_purchase_date date,
  p_notes text,
  p_lines jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid := p_purchase_id;
  v_inserted_id uuid;
  v_count integer;
  v_total numeric;
  v_supplier text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(), 'requests_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'PURCHASE_ID_REQUIRED';
  END IF;

  -- A retry of an already-recorded purchase is a no-op. This is intentionally
  -- checked before parsing the payload: once a purchase id has committed, that
  -- id is the idempotency key and stock must never be added again for it.
  IF EXISTS (SELECT 1 FROM public.purchases WHERE id = v_id) THEN
    RETURN v_id;
  END IF;

  IF p_supplier_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.suppliers
        WHERE id = p_supplier_id AND active = true
     ) THEN
    RAISE EXCEPTION 'SUPPLIER_NOT_AVAILABLE';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'LINES_REQUIRED';
  END IF;

  -- Reject malformed lines instead of silently dropping/clamping them.
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(p_lines) AS l
     WHERE jsonb_typeof(l) <> 'object'
        OR nullif(l->>'inventory_item_id', '') IS NULL
        OR nullif(l->>'quantity', '') IS NULL
        OR (l->>'quantity')::numeric <= 0
        OR (l ? 'line_total') = false
        OR (l->>'line_total') IS NULL
        OR (l->>'line_total')::numeric < 0
  ) THEN
    RAISE EXCEPTION 'INVALID_PURCHASE_LINE';
  END IF;

  CREATE TEMP TABLE _purchase_lines ON COMMIT DROP AS
  SELECT (l->>'inventory_item_id')::uuid AS inventory_item_id,
         SUM((l->>'quantity')::numeric) AS quantity,
         SUM((l->>'line_total')::numeric) AS line_total
    FROM jsonb_array_elements(p_lines) AS l
   GROUP BY 1;

  IF EXISTS (
    SELECT 1
      FROM _purchase_lines pl
     WHERE NOT EXISTS (
       SELECT 1 FROM public.inventory_items i
        WHERE i.id = pl.inventory_item_id AND i.active = true
     )
  ) THEN
    RAISE EXCEPTION 'INVENTORY_ITEM_NOT_AVAILABLE';
  END IF;

  SELECT count(*), coalesce(sum(line_total), 0)
    INTO v_count, v_total
    FROM _purchase_lines;

  SELECT name INTO v_supplier
    FROM public.suppliers
   WHERE id = p_supplier_id;

  INSERT INTO public.purchases(
    id, supplier_id, purchase_date, notes, total_cost, line_count, created_by
  ) VALUES (
    v_id,
    p_supplier_id,
    coalesce(p_purchase_date, CURRENT_DATE),
    nullif(trim(coalesce(p_notes, '')), ''),
    v_total,
    v_count,
    auth.uid()
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  -- Handles two concurrent retries with the same UUID safely.
  IF v_inserted_id IS NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.purchase_lines(purchase_id, inventory_item_id, quantity, line_total)
  SELECT v_id, inventory_item_id, quantity, line_total
    FROM _purchase_lines;

  INSERT INTO public.inventory_movements(
    inventory_item_id,
    movement_type,
    quantity,
    unit_cost,
    notes,
    source_type,
    source_id,
    created_by
  )
  SELECT pl.inventory_item_id,
         'receipt',
         pl.quantity,
         pl.line_total / pl.quantity,
         coalesce(v_supplier, nullif(trim(coalesce(p_notes, '')), '')),
         'purchase',
         v_id,
         auth.uid()
    FROM _purchase_lines pl
  ON CONFLICT (source_type, source_id, inventory_item_id)
    WHERE source_id IS NOT NULL
    DO NOTHING;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'purchase_recorded',
    'purchase',
    v_id,
    jsonb_build_object('lines', v_count, 'total', v_total, 'supplier_id', p_supplier_id)
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_create(uuid, uuid, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_create(uuid, uuid, date, text, jsonb)
  TO authenticated, service_role;
