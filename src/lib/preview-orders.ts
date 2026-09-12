/**
 * PREVIEW-ONLY food ordering prototype.
 *
 * These orders live in dedicated `preview_food_orders` tables and never touch
 * requests, charges, payments, checkout or cash reconciliation. Guests submit
 * through a token-scoped SECURITY DEFINER RPC; staff read/update through
 * permission-gated policies and an audited status RPC.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isDemoPreviewHost } from "./demo-menu";
import type { TranslationKey } from "./i18n";

export const PREVIEW_ORDER_STATUSES = [
  "requested",
  "accepted",
  "preparing",
  "ready",
  "delivered",
  "cancelled",
] as const;

export type PreviewOrderStatus = (typeof PREVIEW_ORDER_STATUSES)[number];

export const PREVIEW_STATUS_LABEL: Record<PreviewOrderStatus, TranslationKey> = {
  requested: "foStatusRequested",
  accepted: "foStatusAccepted",
  preparing: "foStatusPreparing",
  ready: "foStatusReady",
  delivered: "foStatusDelivered",
  cancelled: "foStatusCancelled",
};

export const PREVIEW_TIMINGS = ["asap", "breakfast", "lunch", "dinner"] as const;
export type PreviewTiming = (typeof PREVIEW_TIMINGS)[number];

export const PREVIEW_TIMING_LABEL: Record<PreviewTiming, TranslationKey> = {
  asap: "timingAsap",
  breakfast: "timingBreakfast",
  lunch: "timingLunch",
  dinner: "timingDinner",
};

/** The next status in the kitchen flow, or null when the order is finished. */
export function nextStatus(status: PreviewOrderStatus): PreviewOrderStatus | null {
  const flow: PreviewOrderStatus[] = ["requested", "accepted", "preparing", "ready", "delivered"];
  const i = flow.indexOf(status);
  if (i < 0 || i === flow.length - 1) return null;
  return flow[i + 1] ?? null;
}

export type PreviewOrderItem = {
  id: string;
  label: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type PreviewOrder = {
  id: string;
  stay_id: string;
  status: PreviewOrderStatus;
  timing: PreviewTiming;
  notes: string | null;
  subtotal: number;
  created_at: string;
  items: PreviewOrderItem[];
  room_label: string | null;
  guest_first_name: string | null;
};

/* ---------------- guest side ---------------- */

export async function submitPreviewOrder(params: {
  token: string;
  items: { service_type_id: string; quantity: number }[];
  notes: string;
  timing: PreviewTiming;
}): Promise<string> {
  const { data, error } = await supabase.rpc("guest_create_preview_food_order", {
    p_token: params.token,
    p_items: params.items as never,
    p_notes: params.notes,
    p_timing: params.timing,
  });
  if (error) throw error;
  return data as unknown as string;
}

/* ---------------- staff side ---------------- */

type OrderRow = {
  id: string;
  stay_id: string;
  status: string;
  timing: string;
  notes: string | null;
  subtotal: number | string;
  created_at: string;
  preview_food_order_items: {
    id: string;
    label: string;
    quantity: number;
    unit_price: number | string;
    line_total: number | string;
  }[];
  stays: {
    guests: { full_name: string } | null;
    rooms: { name: string; number: string } | null;
  } | null;
};

export const previewOrdersQuery = {
  queryKey: ["preview-food-orders"],
  refetchInterval: 20_000,
  queryFn: async (): Promise<PreviewOrder[]> => {
    const { data, error } = await supabase
      .from("preview_food_orders")
      .select(
        "id, stay_id, status, timing, notes, subtotal, created_at, preview_food_order_items(id, label, quantity, unit_price, line_total), stays(guests(full_name), rooms(name, number))",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return ((data ?? []) as unknown as OrderRow[]).map((row) => ({
      id: row.id,
      stay_id: row.stay_id,
      status: row.status as PreviewOrderStatus,
      timing: row.timing as PreviewTiming,
      notes: row.notes,
      subtotal: Number(row.subtotal ?? 0),
      created_at: row.created_at,
      items: (row.preview_food_order_items ?? []).map((i) => ({
        id: i.id,
        label: i.label,
        quantity: i.quantity,
        unit_price: Number(i.unit_price ?? 0),
        line_total: Number(i.line_total ?? 0),
      })),
      room_label: row.stays?.rooms ? (row.stays.rooms.name ?? row.stays.rooms.number) : null,
      guest_first_name: row.stays?.guests?.full_name?.trim().split(" ")[0] ?? null,
    }));
  },
};

export async function setPreviewOrderStatus(id: string, status: PreviewOrderStatus) {
  const { error } = await supabase.rpc("preview_food_order_set_status", {
    p_order_id: id,
    p_status: status,
  });
  if (error) throw error;
}

/** True only on Lovable preview hosts, after hydration (defaults to hidden). */
export function useIsPreviewHost(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    setOk(isDemoPreviewHost(window.location.hostname));
  }, []);
  return ok;
}
