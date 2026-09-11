import { supabase } from "@/integrations/supabase/client";

/**
 * Decides the first page after sign-in. Asks the database `has_permission`
 * RPC instead of trusting client-side role state, which can still be stale
 * during the auth transition. Falls back to `/home` on any failure so users
 * never land on a page their permissions forbid.
 */
export async function resolveLandingPath(): Promise<"/dashboard" | "/home"> {
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return "/home";

    const { data, error } = await supabase.rpc("has_permission", {
      _user_id: userData.user.id,
      _key: "activity_view",
    });
    if (error || !data) return "/home";
    return "/dashboard";
  } catch {
    return "/home";
  }
}
