-- Run as database owner only, after explicit approval for the target project.
-- Assertions roll back this import if any existing business records change.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
DECLARE old_purchases jsonb; old_lines jsonb; old_suppliers jsonb;
        old_movements jsonb; old_services jsonb;
BEGIN
  -- Same lock order as the demo reset; prevents overlapping with its hourly job.
  PERFORM pg_advisory_xact_lock(627318491);
  SELECT coalesce(jsonb_object_agg(id, to_jsonb(p)), '{}') INTO old_purchases FROM public.purchases p;
  SELECT coalesce(jsonb_object_agg(id, to_jsonb(p)), '{}') INTO old_lines FROM public.purchase_lines p;
  SELECT coalesce(jsonb_object_agg(id, to_jsonb(p)), '{}') INTO old_suppliers FROM public.suppliers p;
  SELECT coalesce(jsonb_object_agg(id, to_jsonb(p)), '{}') INTO old_movements FROM public.inventory_movements p;
  SELECT coalesce(jsonb_object_agg(id, to_jsonb(p)), '{}') INTO old_services FROM public.service_types p;

  PERFORM finance_sample_private.seed_history();
  IF NOT old_purchases <@ (SELECT coalesce(jsonb_object_agg(id, to_jsonb(p)), '{}') FROM public.purchases p)
     OR NOT old_lines <@ (SELECT coalesce(jsonb_object_agg(id, to_jsonb(p)), '{}') FROM public.purchase_lines p)
     OR NOT old_suppliers <@ (SELECT coalesce(jsonb_object_agg(id, to_jsonb(p)), '{}') FROM public.suppliers p)
     OR old_movements IS DISTINCT FROM (SELECT coalesce(jsonb_object_agg(id, to_jsonb(p)), '{}') FROM public.inventory_movements p)
     OR old_services IS DISTINCT FROM (SELECT coalesce(jsonb_object_agg(id, to_jsonb(p)), '{}') FROM public.service_types p) THEN
    RAISE EXCEPTION 'Seed changed existing business records';
  END IF;
  IF finance_sample_private.seed_history() <> 0 THEN
    RAISE EXCEPTION 'Seed replay unexpectedly added purchases';
  END IF;
END $$;
COMMIT;

SELECT count(*) AS fictional_purchases, sum(line_count) AS fictional_purchase_lines
FROM public.purchases WHERE notes LIKE '[FICTIONAL FINANCE V1]%';
