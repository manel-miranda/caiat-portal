/**
 * Kitchen food orders.
 *
 * Guest and staff entry points create the same order type (table names keep
 * their historical `preview_food_*` prefix). Orders created from the real menu
 * are flagged `billable` and, on delivery, produce guest bill charges exactly
 * once alongside the once-only recipe stock consumption. Legacy/demo orders
 * stay non-billable and are never charged. Guests submit through a
 * token-scoped SECURITY DEFINER RPC; staff create and advance orders through
 * permission-gated, audited RPCs.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isDemoPreviewHost } from "./demo-menu";
import { t, type TranslationKey } from "./i18n";

/**
 * "ready" was removed from the workflow; legacy rows are normalised to
 * "preparing" in the database and defensively mapped on read.
 */
export const PREVIEW_ORDER_STATUSES = [
  "requested",
  "accepted",
  "preparing",
  "delivered",
  "cancelled",
] as const;

export type PreviewOrderStatus = (typeof PREVIEW_ORDER_STATUSES)[number];

export const PREVIEW_STATUS_LABEL: Record<PreviewOrderStatus, TranslationKey> = {
  requested: "foStatusRequested",
  accepted: "foStatusAccepted",
  preparing: "foStatusPreparing",
  delivered: "foStatusDelivered",
  cancelled: "foStatusCancelled",
};

function normaliseStatus(raw: string): PreviewOrderStatus {
  if (raw === "ready") return "preparing";
  return (PREVIEW_ORDER_STATUSES as readonly string[]).includes(raw)
    ? (raw as PreviewOrderStatus)
    : "requested";
}

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
  const flow: PreviewOrderStatus[] = ["requested", "accepted", "preparing", "delivered"];
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

export type FoodOrderOrigin = "guest" | "staff";

export type PreviewOrder = {
  id: string;
  stay_id: string;
  origin: FoodOrderOrigin;
  billable: boolean;
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

/** Staff creates a kitchen order from the real menu; prices come from the server. */
export async function staffCreateFoodOrder(params: {
  stayId: string;
  items: { service_type_id: string; quantity: number }[];
  notes: string;
  timing: PreviewTiming;
}): Promise<string> {
  const { data, error } = await supabase.rpc("staff_create_food_order", {
    p_stay_id: params.stayId,
    p_items: params.items as never,
    p_notes: params.notes,
    p_timing: params.timing,
  });
  if (error) throw new Error(foodOrderErrorMessage(error.message));
  return data as unknown as string;
}

/** Maps raw RPC errors onto localized messages. */
export function foodOrderErrorMessage(raw: string): string {
  if (raw.includes("PERMISSION_DENIED")) return t("permissionDenied");
  if (raw.includes("STAY_NOT_ACTIVE")) return t("foodOrderStayNotActive");
  if (raw.includes("INVALID_ITEM")) return t("foodOrderInvalidItem");
  if (raw.includes("EMPTY_ORDER")) return t("foodOrderEmpty");
  return raw;
}

/** Kitchen orders for one stay, newest first. */
export function stayFoodOrdersQuery(stayId: string) {
  return {
    queryKey: ["preview-food-orders", "stay", stayId],
    queryFn: async (): Promise<PreviewOrder[]> => {
      const all = await previewOrdersQuery.queryFn();
      return all.filter((o) => o.stay_id === stayId);
    },
  };
}

type OrderRow = {
  id: string;
  stay_id: string;
  origin: string | null;
  billable: boolean | null;
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
        "id, stay_id, origin, billable, status, timing, notes, subtotal, created_at, preview_food_order_items(id, label, quantity, unit_price, line_total), stays(guests(full_name), rooms(name, number))",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return ((data ?? []) as unknown as OrderRow[]).map((row) => ({
      id: row.id,
      stay_id: row.stay_id,
      origin: row.origin === "staff" ? "staff" : "guest",
      billable: Boolean(row.billable),
      status: normaliseStatus(row.status),
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
