-- Harden direct access to the inventory consumption RPC.
-- Only staff with requests_manage may create order-derived consumption movements.
CREATE OR REPLACE FUNCTION public.inventory_consume_preview_order(p_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(), 'requests_manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

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
  ON CONFLICT (source_type, source_id, inventory_item_id)
    WHERE source_id IS NOT NULL
    DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_consume_preview_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_consume_preview_order(uuid) TO authenticated, service_role;
