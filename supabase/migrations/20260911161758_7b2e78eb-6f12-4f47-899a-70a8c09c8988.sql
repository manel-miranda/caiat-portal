-- charges: read for all signed-in staff, writes require payments_manage
DROP POLICY IF EXISTS "charges all authenticated" ON public.charges;
CREATE POLICY "charges select" ON public.charges FOR SELECT TO authenticated USING (true);
CREATE POLICY "charges insert" ON public.charges FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'payments_manage'));
CREATE POLICY "charges update" ON public.charges FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'payments_manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'payments_manage'));
CREATE POLICY "charges delete" ON public.charges FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'payments_manage'));

-- payments: insert requires the permission AND self-attribution
DROP POLICY IF EXISTS "payments insert" ON public.payments;
CREATE POLICY "payments insert" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (received_by = auth.uid() AND public.has_permission(auth.uid(), 'payments_manage'));

-- requests: read for all signed-in staff, writes require requests_manage
DROP POLICY IF EXISTS "requests all authenticated" ON public.requests;
CREATE POLICY "requests select" ON public.requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "requests insert" ON public.requests FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'requests_manage'));
CREATE POLICY "requests update" ON public.requests FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'requests_manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'requests_manage'));
CREATE POLICY "requests delete" ON public.requests FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'requests_manage'));

-- live updates for identity tables (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='profiles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='user_roles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='user_permissions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_permissions;
  END IF;
END $$;