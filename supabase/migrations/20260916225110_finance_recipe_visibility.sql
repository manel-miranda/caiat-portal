-- Preserve production billing flags while including demo recipes and legacy
-- ingredients referenced by reportable dishes. No business records are changed.
-- Finance indicators are staff-only. Costs are never included in guest RPC output.
CREATE OR REPLACE FUNCTION public.finance_profitability(p_include_preview boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ingredients jsonb;
  v_dishes jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.has_permission(auth.uid(), 'activity_view') IS NOT TRUE THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'label', i.label,
           'unit', i.unit,
           'unitCost', c.last_unit_cost,
           'lastPurchasedAt', c.last_purchased_at
         ) ORDER BY i.label), '[]'::jsonb)
    INTO v_ingredients
    FROM public.inventory_items i
    LEFT JOIN public.inventory_purchase_context c ON c.inventory_item_id = i.id
   WHERE i.active = true AND (p_include_preview OR NOT i.preview_only OR EXISTS (
     SELECT 1 FROM public.inventory_recipe_components rc
     JOIN public.service_types st ON st.id = rc.service_type_id
     WHERE rc.inventory_item_id = i.id AND st.active AND NOT st.preview_only AND st.billable
   ));

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id,
           'label', x.label,
           'price', x.price,
           'cost', x.cost,
           'grossProfit', CASE WHEN x.cost IS NULL THEN NULL ELSE round(x.price - x.cost, 2) END,
           'marginPercent', CASE WHEN x.cost IS NULL OR x.price <= 0 THEN NULL
                                 ELSE round((x.price - x.cost) / x.price * 100, 1) END,
           'missingCost', x.cost IS NULL
         ) ORDER BY x.label), '[]'::jsonb)
    INTO v_dishes
    FROM (
      SELECT st.id,
             st.label,
             st.default_price AS price,
             CASE WHEN count(rc.id) > 0 AND count(rc.id) = count(c.last_unit_cost)
                  THEN round(sum(rc.qty_per_portion * c.last_unit_cost), 2)
                  ELSE NULL END AS cost
        FROM public.service_types st
        LEFT JOIN public.inventory_recipe_components rc ON rc.service_type_id = st.id
        LEFT JOIN public.inventory_purchase_context c ON c.inventory_item_id = rc.inventory_item_id
       WHERE st.active = true AND (p_include_preview OR NOT st.preview_only) AND (st.billable OR (p_include_preview AND st.preview_only))
         AND (st.guest_category = 'food' OR st.category = 'food' OR rc.id IS NOT NULL)
       GROUP BY st.id, st.label, st.default_price
    ) x;

  RETURN jsonb_build_object('ingredients', v_ingredients, 'dishes', v_dishes);
END;
$$;

REVOKE ALL ON FUNCTION public.finance_profitability(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_profitability(boolean) TO authenticated, service_role;
