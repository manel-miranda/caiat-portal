import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Route-level admin enforcement for the management screens. Runs client-side
 * (the `_authenticated` subtree is `ssr: false`) and checks the role in the
 * database, so typing the URL manually cannot bypass it. Database RLS stays
 * the real boundary; this only keeps the UI honest.
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
