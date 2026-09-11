-- Default replica identity only sends the primary key on DELETE, so a removed
-- override/role would not match the user_id filter on an open subscription.
ALTER TABLE public.user_permissions REPLICA IDENTITY FULL;
ALTER TABLE public.user_roles REPLICA IDENTITY FULL;