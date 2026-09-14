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

/**
 * Guest-menu subcategories. Staff kitchen orders accept exactly what the guest
 * menu offers; breakfast, meals and room service stay ordinary requests.
 */
export const MENU_SUBCATEGORIES = new Set(["signature", "mains", "drinks", "desserts"]);

export type MenuDishLike = {
  guest_category?: string | null;
  guest_subcategory?: string | null;
  guest_visible?: boolean | null;
  available_today?: boolean | null;
  preview_only?: boolean | null;
  requestable?: boolean | null;
};

/** Mirrors the server-side eligibility check in `staff_create_food_order`. */
export function isKitchenMenuDish(s: MenuDishLike | undefined | null): boolean {
  if (!s) return false;
  return (
    s.guest_category === "food" &&
    MENU_SUBCATEGORIES.has(s.guest_subcategory ?? "") &&
    s.preview_only !== true &&
    s.guest_visible !== false &&
    s.available_today !== false &&
    s.requestable !== false
  );
}

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
  /** Last transition time; falls back to creation for untouched orders. */
  updated_at: string;
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
  if (raw.includes("PERMISSION_DENIED:payments_manage")) return t("foodOrderNeedsPayments");
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
      return fetchOrders(stayId);
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
  updated_at: string | null;
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

const ORDER_SELECT = "id, stay_id, origin, billable, status, timing, notes, subtotal, created_at, updated_at, preview_food_order_items(id, label, quantity, unit_price, line_total), stays(guests(full_name), rooms(name, number))";

/** All open orders plus recent history; stay views are filtered on the server. */
async function fetchOrders(stayId?: string): Promise<PreviewOrder[]> {
  const rows: OrderRow[] = [];
  for (let offset = 0; ; offset += 300) {
    let query = supabase.from("preview_food_orders").select(ORDER_SELECT)
      .not("status", "in", "(delivered,cancelled)")
      .order("created_at").order("id").range(offset, offset + 299);
    if (stayId) query = query.eq("stay_id", stayId);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as OrderRow[]));
    if ((data ?? []).length < 300) break;
  }
  let query = supabase.from("preview_food_orders").select(ORDER_SELECT)
    .in("status", ["delivered", "cancelled"])
    .order("updated_at", { ascending: false }).order("id").limit(100);
  if (stayId) query = query.eq("stay_id", stayId);
  const { data, error } = await query;
  if (error) throw error;
  rows.push(...((data ?? []) as unknown as OrderRow[]));
  return rows.map((row) => ({
      id: row.id,
      stay_id: row.stay_id,
      origin: row.origin === "staff" ? "staff" : "guest",
      billable: Boolean(row.billable),
      status: normaliseStatus(row.status),
      timing: row.timing as PreviewTiming,
      notes: row.notes,
      subtotal: Number(row.subtotal ?? 0),
      created_at: row.created_at,
      updated_at: row.updated_at ?? row.created_at,
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
}

export const previewOrdersQuery = {
  queryKey: ["preview-food-orders"],
  refetchInterval: 20_000,
  queryFn: () => fetchOrders(),
};

export async function setPreviewOrderStatus(id: string, status: PreviewOrderStatus) {
  const { error } = await supabase.rpc("preview_food_order_set_status", {
    p_order_id: id,
    p_status: status,
  });
  if (error) throw new Error(foodOrderErrorMessage(error.message));
}

/** True only on Lovable preview hosts, after hydration (defaults to hidden). */
export function useIsPreviewHost(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    setOk(isDemoPreviewHost(window.location.hostname));
  }, []);
  return ok;
}
