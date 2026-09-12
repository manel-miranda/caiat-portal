CREATE OR REPLACE VIEW public.inventory_status AS
 WITH totals AS (
         SELECT i_1.id,
            COALESCE(sum(m.quantity), 0::numeric) AS estimated_stock,
            COALESCE(sum(
                CASE
                    WHEN m.movement_type = 'consumption'::text AND m.created_at >= (now() - '14 days'::interval) THEN - m.quantity
                    ELSE 0::numeric
                END), 0::numeric) AS used_14d
           FROM inventory_items i_1
             LEFT JOIN inventory_movements m ON m.inventory_item_id = i_1.id
          GROUP BY i_1.id
        )
 SELECT i.id,
    i.key,
    i.label,
    i.unit,
    i.active,
    i.preview_only,
    i.safety_stock,
    i.target_days,
    i.notes,
    t.estimated_stock,
    t.used_14d / 14.0 AS avg_daily_usage,
        CASE
            WHEN t.used_14d > 0::numeric THEN t.estimated_stock / (t.used_14d / 14.0)
            ELSE NULL::numeric
        END AS days_remaining,
        CASE
            WHEN t.estimated_stock < i.safety_stock THEN 'buy'::text
            WHEN t.used_14d > 0::numeric AND ((t.estimated_stock - i.safety_stock) / (t.used_14d / 14.0)) < 1::numeric THEN 'buy'::text
            WHEN t.used_14d > 0::numeric AND (t.estimated_stock / (t.used_14d / 14.0)) < 3::numeric THEN 'low'::text
            WHEN t.estimated_stock < (i.safety_stock * 1.5) THEN 'low'::text
            ELSE 'good'::text
        END AS status,
    GREATEST(0::numeric, i.target_days::numeric * (t.used_14d / 14.0) + i.safety_stock - t.estimated_stock) AS recommended_quantity
   FROM inventory_items i
     JOIN totals t ON t.id = i.id;