-- ============ SUPPLIERS + PURCHASES ============
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  location text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read suppliers" ON public.suppliers
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  total_cost numeric NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  line_count integer NOT NULL DEFAULT 0 CHECK (line_count >= 0),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read purchases" ON public.purchases
  FOR SELECT TO authenticated USING (true);
CREATE INDEX purchases_date_idx ON public.purchases (purchase_date DESC, created_at DESC);

CREATE TABLE public.purchase_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  line_total numeric NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_id, inventory_item_id)
);
GRANT SELECT ON public.purchase_lines TO authenticated;
GRANT ALL ON public.purchase_lines TO service_role;
ALTER TABLE public.purchase_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read purchase lines" ON public.purchase_lines
  FOR SELECT TO authenticated USING (true);
CREATE INDEX purchase_lines_purchase_idx ON public.purchase_lines (purchase_id);

CREATE OR REPLACE FUNCTION public.suppliers_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER suppliers_touch_trg BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.suppliers_touch();
CREATE TRIGGER purchases_touch_trg BEFORE UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.suppliers_touch();

-- ============ WRITE RPCs ============
CREATE OR REPLACE FUNCTION public.supplier_upsert(
  p_id uuid, p_name text, p_phone text, p_location text, p_notes text, p_active boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(), 'requests_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  v_name := nullif(trim(coalesce(p_name, '')), '');
  IF v_name IS NULL THEN RAISE EXCEPTION 'NAME_REQUIRED'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.suppliers(name, phone, location, notes, active, created_by)
    VALUES (v_name,
            nullif(trim(coalesce(p_phone,'')),''),
            nullif(trim(coalesce(p_location,'')),''),
            nullif(trim(coalesce(p_notes,'')),''),
            coalesce(p_active, true), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.suppliers
       SET name = v_name,
           phone = nullif(trim(coalesce(p_phone,'')),''),
           location = nullif(trim(coalesce(p_location,'')),''),
           notes = nullif(trim(coalesce(p_notes,'')),''),
           active = coalesce(p_active, active)
     WHERE id = p_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  END IF;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'supplier_saved', 'supplier', v_id, jsonb_build_object('name', v_name));
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.supplier_upsert(uuid, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supplier_upsert(uuid, text, text, text, text, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supplier_set_active(p_id uuid, p_active boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(), 'requests_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  UPDATE public.suppliers SET active = coalesce(p_active, true) WHERE id = p_id RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'supplier_active_changed', 'supplier', v_id,
          jsonb_build_object('active', coalesce(p_active, true)));
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.supplier_set_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supplier_set_active(uuid, boolean) TO authenticated, service_role;

-- Atomic: purchase header + aggregated lines + positive receipt movements.
CREATE OR REPLACE FUNCTION public.purchase_create(
  p_supplier_id uuid, p_purchase_date date, p_notes text, p_lines jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_count integer; v_total numeric; v_supplier text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(), 'requests_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  IF p_supplier_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = p_supplier_id) THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  CREATE TEMP TABLE _purchase_lines ON COMMIT DROP AS
  SELECT (l->>'inventory_item_id')::uuid AS inventory_item_id,
         SUM((l->>'quantity')::numeric) AS quantity,
         SUM(greatest(coalesce((l->>'line_total')::numeric, 0), 0)) AS line_total
    FROM jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) AS l
   WHERE (l->>'inventory_item_id') IS NOT NULL
     AND coalesce((l->>'quantity')::numeric, 0) > 0
   GROUP BY 1;

  IF NOT EXISTS (SELECT 1 FROM _purchase_lines) THEN
    RAISE EXCEPTION 'LINES_REQUIRED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _purchase_lines pl
     WHERE NOT EXISTS (SELECT 1 FROM public.inventory_items i WHERE i.id = pl.inventory_item_id)
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  SELECT count(*), coalesce(sum(line_total), 0) INTO v_count, v_total FROM _purchase_lines;
  SELECT name INTO v_supplier FROM public.suppliers WHERE id = p_supplier_id;

  INSERT INTO public.purchases(supplier_id, purchase_date, notes, total_cost, line_count, created_by)
  VALUES (p_supplier_id, coalesce(p_purchase_date, CURRENT_DATE),
          nullif(trim(coalesce(p_notes,'')),''), v_total, v_count, auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.purchase_lines(purchase_id, inventory_item_id, quantity, line_total)
  SELECT v_id, inventory_item_id, quantity, line_total FROM _purchase_lines;

  INSERT INTO public.inventory_movements(
    inventory_item_id, movement_type, quantity, unit_cost, notes, source_type, source_id, created_by)
  SELECT pl.inventory_item_id, 'receipt', pl.quantity,
         CASE WHEN pl.quantity > 0 AND pl.line_total > 0 THEN pl.line_total / pl.quantity END,
         coalesce(v_supplier, nullif(trim(coalesce(p_notes,'')),'')),
         'purchase', v_id, auth.uid()
    FROM _purchase_lines pl
  ON CONFLICT (source_type, source_id, inventory_item_id)
    WHERE source_id IS NOT NULL
    DO NOTHING;

  DROP TABLE _purchase_lines;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'purchase_recorded', 'purchase', v_id,
          jsonb_build_object('lines', v_count, 'total', v_total, 'supplier_id', p_supplier_id));
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.purchase_create(uuid, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_create(uuid, date, text, jsonb) TO authenticated, service_role;