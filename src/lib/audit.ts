import { supabase } from "@/integrations/supabase/client";

/**
 * Records an attributable action. Fire-and-forget: an audit failure must
 * never block the operational action the staff member just completed.
 */
export async function logAudit(
  userId: string | undefined,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown> = {},
) {
  if (!userId) return;
  try {
    await supabase.from("audit_log").insert({
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details: details as never,
    });
  } catch {
    /* ignore */
  }
}
