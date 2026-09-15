-- Item snapshots drive both delivery billing and recipe consumption. Clients
-- must not change them independently of the protected order workflow.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.preview_food_order_items
  FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "preview order items delete" ON public.preview_food_order_items;

-- Keep the existing staff SELECT policy and service_role privileges. The
-- SECURITY DEFINER order functions retain their owner's table access.
