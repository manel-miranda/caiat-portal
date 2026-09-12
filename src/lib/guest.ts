/**
 * Guest portal data layer.
 *
 * Everything goes through SECURITY DEFINER RPCs that validate the access token
 * server-side and return only guest-safe fields. The underlying stays/guests/
 * charges/payments/requests tables stay closed to anonymous users.
 */
import { supabase } from "@/integrations/supabase/client";

export type GuestCharge = { id: string; label: string; quantity: number; total: number };
export type GuestRequest = {
  id: string;
  label: string;
  status: string;
  scheduled_at: string | null;
  created_at: string;
};
export type GuestService = {
  id: string;
  key: string;
  label: string;
  default_price: number;
  billable: boolean;
  category: string;
  /** Guest-facing catalogue placement (food, activities, transport, explore, extras, else). */
  guest_category: string | null;
  guest_subcategory: string | null;
  short_description: string | null;
  activity_mode: string | null;
  difficulty: string | null;
  featured: boolean;
  signature: boolean;
  display_order: number;
};

export type GuestPortalData = {
  guest_first_name: string | null;
  room_name: string | null;
  room_number: string | null;
  check_in: string;
  check_out: string;
  num_guests: number;
  accommodation_total: number;
  charges: GuestCharge[];
  charges_total: number;
  total: number;
  paid: number;
  outstanding: number;
  requests: GuestRequest[];
  services: GuestService[];
};

export function guestPortalQuery(token: string) {
  return {
    queryKey: ["guest-portal", token],
    retry: false,
    refetchOnWindowFocus: true,
    // No realtime for anonymous visitors: a light poll keeps statuses fresh.
    refetchInterval: 30_000,
    queryFn: async (): Promise<GuestPortalData | null> => {
      const { data, error } = await supabase.rpc("guest_portal", { p_token: token });
      if (error) throw error;
      return (data as unknown as GuestPortalData) ?? null;
    },
  };
}

export async function guestCreateRequest(params: {
  token: string;
  serviceTypeId: string | null;
  customLabel: string;
  notes: string;
  kind?: "service" | "payment_help";
}) {
  const { data, error } = await supabase.rpc("guest_create_request", {
    p_token: params.token,
    // The SQL argument is nullable; the generated types omit that.
    p_service_type_id: params.serviceTypeId as string,
    p_custom_label: params.customLabel,
    p_notes: params.notes,
    p_kind: params.kind ?? "service",
  });
  if (error) throw new Error(guestErrorKey(error.message));
  return data as unknown as string;
}

/** Maps raw RPC errors onto stable codes the UI translates. */
export function guestErrorKey(raw: string): string {
  if (raw.includes("TOO_MANY_REQUESTS")) return "TOO_MANY_REQUESTS";
  if (raw.includes("INVALID_TOKEN")) return "INVALID_TOKEN";
  if (raw.includes("INVALID_SERVICE")) return "INVALID_SERVICE";
  if (raw.includes("LABEL_REQUIRED")) return "LABEL_REQUIRED";
  if (raw.includes("LABEL_TOO_LONG") || raw.includes("NOTES_TOO_LONG")) return "TOO_LONG";
  return "GENERIC";
}

/* ---------------- staff side ---------------- */

export function guestTokenQuery(stayId: string) {
  return {
    queryKey: ["guest-token", stayId],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("guest_access_tokens")
        .select("token")
        .eq("stay_id", stayId)
        .eq("active", true)
        .maybeSingle();
      if (error) throw error;
      return data?.token ?? null;
    },
  };
}

export async function generateGuestToken(stayId: string) {
  const { data, error } = await supabase.rpc("guest_token_generate", { p_stay_id: stayId });
  if (error) throw error;
  return data as unknown as string;
}

export async function revokeGuestToken(stayId: string) {
  const { error } = await supabase.rpc("guest_token_revoke", { p_stay_id: stayId });
  if (error) throw error;
}

/** Absolute guest URL built from the current origin, so preview and production both work. */
export function guestUrl(token: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/guest/${token}`;
}
