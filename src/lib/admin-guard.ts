import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { PermissionKey } from "./permissions";

/**
 * Route-level enforcement for the management screens. Runs client-side
 * (the `_authenticated` subtree is `ssr: false`) and asks the database, so
 * typing the URL manually cannot bypass it. Database RLS and the SECURITY
 * DEFINER RPCs stay the real boundary; this only keeps the UI honest.
 */
export async function requireAdmin() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw redirect({ to: "/" });

  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (error || !data) throw redirect({ to: "/home" });
  return { adminId: userData.user.id };
}

/** Same idea, but for an effective permission instead of a raw role. */
export function requirePermission(key: PermissionKey) {
  return async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw redirect({ to: "/" });

    const { data, error } = await supabase.rpc("has_permission", {
      _user_id: userData.user.id,
      _key: key,
    });
    if (error || !data) throw redirect({ to: "/home" });
    return { userId: userData.user.id };
  };
}
