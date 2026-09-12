import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Operational tables whose changes must be reflected on any open screen, and
 * the query key prefixes each one feeds. Keys stay coarse on purpose: a single
 * invalidation is cheaper than tracking every derived list.
 */
const TABLE_KEYS: Record<string, string[][]> = {
  stays: [["stays"], ["stay"], ["requests"], ["audit"]],
  charges: [["charges"], ["stay"], ["stays"], ["audit"]],
  payments: [["payments"], ["cash"], ["stay"], ["stays"], ["audit"]],
  requests: [["requests"], ["audit"]],
  cash_reconciliations: [["cash"], ["audit"]],
  // A guest rename changes what every stay card shows, so it must refresh too.
  guests: [["stays"], ["stay"], ["requests"], ["customers"], ["customer"]],
  // Team management screens and the signed-in user's own permissions.
  profiles: [["managed-users"]],
  user_roles: [["managed-users"]],
  user_permissions: [["managed-users"]],
  // Preview stock prototype: purchases, corrections and order consumption.
  inventory_movements: [["inventory"]],
  inventory_recipe_components: [["inventory"]],
};

/**
 * One app-level Realtime channel for the whole authenticated shell. Mounting it
 * in a single place avoids duplicate subscriptions, and the cleanup removes the
 * channel so a remount (or sign-out) never leaks a socket.
 */
export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase.channel("caiat-ops");

    for (const table of Object.keys(TABLE_KEYS)) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        for (const key of TABLE_KEYS[table] ?? []) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
      });
    }

    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
