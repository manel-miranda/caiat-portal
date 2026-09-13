-- Harden the Suppliers + Purchases write path after CI review.
-- Keep the existing public RPC signature, but make the client-supplied UUID a
-- required idempotency key and tighten payload/supplier validation.

CREATE OR REPLACE FUNCTION public.inventory_record_purchase(
  p_purchase_id uuid,
  p_supplier_id uuid,
  p_purchased_at timestamptz,
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
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(), 'requests_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'PURCHASE_ID_REQUIRED';
  END IF;

  -- The caller keeps this UUID stable across retries. Once committed, replaying
  -- the same request is a no-op and therefore cannot add stock twice.
  IF EXISTS (SELECT 1 FROM public.purchases WHERE id = v_id) THEN
    RETURN v_id;
  END IF;

  IF p_supplier_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.suppliers
        WHERE id = p_supplier_id
          AND active = true
     ) THEN
    RAISE EXCEPTION 'SUPPLIER_NOT_AVAILABLE';
  END IF;

  IF p_lines IS NULL
     OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'LINES_REQUIRED';
  END IF;

  CREATE TEMP TABLE _rec_lines ON COMMIT DROP AS
  SELECT (l->>'inventory_item_id')::uuid AS inventory_item_id,
         (l->>'quantity')::numeric AS quantity,
         coalesce((l->>'unit_cost')::numeric, 0) AS unit_cost
    FROM jsonb_array_elements(p_lines) AS l
   WHERE jsonb_typeof(l) = 'object';

  IF NOT EXISTS (SELECT 1 FROM _rec_lines) THEN
    RAISE EXCEPTION 'LINES_REQUIRED';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM _rec_lines
     WHERE inventory_item_id IS NULL
        OR quantity IS NULL
        OR quantity <= 0
  ) THEN
    RAISE EXCEPTION 'QUANTITY_INVALID';
  END IF;

  IF EXISTS (SELECT 1 FROM _rec_lines WHERE unit_cost < 0) THEN
    RAISE EXCEPTION 'COST_INVALID';
  END IF;

  IF EXISTS (
    SELECT inventory_item_id
      FROM _rec_lines
     GROUP BY inventory_item_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_ITEM';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM _rec_lines rl
     WHERE NOT EXISTS (
       SELECT 1
         FROM public.inventory_items i
        WHERE i.id = rl.inventory_item_id
          AND i.active = true
     )
  ) THEN
    RAISE EXCEPTION 'INVENTORY_ITEM_NOT_AVAILABLE';
  END IF;

  SELECT count(*), coalesce(sum(round(quantity * unit_cost, 2)), 0)
    INTO v_count, v_total
    FROM _rec_lines;

  SELECT name INTO v_supplier
    FROM public.suppliers
   WHERE id = p_supplier_id;

  INSERT INTO public.purchases(
    id,
    supplier_id,
    purchase_date,
    purchased_at,
    notes,
    total_cost,
    line_count,
    created_by
  ) VALUES (
    v_id,
    p_supplier_id,
    coalesce(p_purchased_at, now())::date,
    coalesce(p_purchased_at, now()),
    v_notes,
    v_total,
    v_count,
    auth.uid()
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  -- Covers concurrent retries with the same idempotency key.
  IF v_inserted_id IS NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.purchase_lines(
    purchase_id,
    inventory_item_id,
    quantity,
    unit_cost,
    line_total
  )
  SELECT v_id,
         inventory_item_id,
         quantity,
         CASE WHEN unit_cost > 0 THEN unit_cost END,
         round(quantity * unit_cost, 2)
    FROM _rec_lines;

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
  SELECT rl.inventory_item_id,
         'receipt',
         rl.quantity,
         CASE WHEN rl.unit_cost > 0 THEN rl.unit_cost END,
         coalesce(v_supplier, v_notes),
         'purchase',
         v_id,
         auth.uid()
    FROM _rec_lines rl
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

REVOKE ALL ON FUNCTION public.inventory_record_purchase(uuid, uuid, timestamptz, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_record_purchase(uuid, uuid, timestamptz, text, jsonb)
  TO authenticated, service_role;
