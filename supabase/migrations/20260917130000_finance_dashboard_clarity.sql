-- Add activity-based finance indicators that move with stock, simulations, and purchases.
-- Margin cards still use recipe costs; these summary values reflect operational activity.
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
  v_current_stock_value numeric;
  v_recommended_buy_cost numeric;
  v_purchase_spend_30d numeric;
  v_purchase_spend_previous_30d numeric;
  v_stock_coverage_days numeric;
  v_low_stock_items integer;
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

  SELECT coalesce(round(sum(greatest(s.estimated_stock, 0) * coalesce(c.last_unit_cost, 0)), 2), 0),
         coalesce(round(sum(greatest(s.recommended_quantity, 0) * coalesce(c.last_unit_cost, 0)), 2), 0)
    INTO v_current_stock_value, v_recommended_buy_cost
    FROM public.inventory_status s
    LEFT JOIN public.inventory_purchase_context c ON c.inventory_item_id = s.id
   WHERE s.active = true AND (p_include_preview OR NOT s.preview_only OR EXISTS (
     SELECT 1 FROM public.inventory_recipe_components rc
     JOIN public.service_types st ON st.id = rc.service_type_id
     WHERE rc.inventory_item_id = s.id AND st.active AND NOT st.preview_only AND st.billable
   ));

  SELECT round(min(greatest(s.days_remaining, 0)) FILTER (WHERE s.avg_daily_usage > 0), 1),
         count(*) FILTER (WHERE s.status IN ('buy', 'low'))
    INTO v_stock_coverage_days, v_low_stock_items
    FROM public.inventory_status s
   WHERE s.active = true AND (p_include_preview OR NOT s.preview_only OR EXISTS (
     SELECT 1 FROM public.inventory_recipe_components rc
     JOIN public.service_types st ON st.id = rc.service_type_id
     WHERE rc.inventory_item_id = s.id AND st.active AND NOT st.preview_only AND st.billable
   ));

  SELECT coalesce(round(sum(pl.quantity * pl.unit_cost), 2), 0)
    INTO v_purchase_spend_30d
    FROM public.purchases p
    JOIN public.purchase_lines pl ON pl.purchase_id = p.id
    JOIN public.inventory_items i ON i.id = pl.inventory_item_id
   WHERE p.purchased_at >= now() - interval '30 days'
     AND i.active = true
     AND (p_include_preview OR NOT i.preview_only OR EXISTS (
       SELECT 1 FROM public.inventory_recipe_components rc
       JOIN public.service_types st ON st.id = rc.service_type_id
       WHERE rc.inventory_item_id = i.id AND st.active AND NOT st.preview_only AND st.billable
     ));

  SELECT coalesce(round(sum(pl.quantity * pl.unit_cost), 2), 0)
    INTO v_purchase_spend_previous_30d
    FROM public.purchases p
    JOIN public.purchase_lines pl ON pl.purchase_id = p.id
    JOIN public.inventory_items i ON i.id = pl.inventory_item_id
   WHERE p.purchased_at >= now() - interval '60 days'
     AND p.purchased_at < now() - interval '30 days'
     AND i.active = true
     AND (p_include_preview OR NOT i.preview_only OR EXISTS (
       SELECT 1 FROM public.inventory_recipe_components rc
       JOIN public.service_types st ON st.id = rc.service_type_id
       WHERE rc.inventory_item_id = i.id AND st.active AND NOT st.preview_only AND st.billable
     ));

  RETURN jsonb_build_object(
    'ingredients', v_ingredients,
    'dishes', v_dishes,
    'summary', jsonb_build_object(
      'currentStockValue', v_current_stock_value,
      'recommendedBuyCost', v_recommended_buy_cost,
      'purchaseSpend30d', v_purchase_spend_30d,
      'purchaseSpendPrevious30d', v_purchase_spend_previous_30d,
      'stockCoverageDays', v_stock_coverage_days,
      'lowStockItems', v_low_stock_items
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finance_profitability(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_profitability(boolean) TO authenticated, service_role;
