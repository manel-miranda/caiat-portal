/**
 * PREVIEW-FIRST inventory / groceries forecasting.
 *
 * Estimated stock, not warehouse accounting: every change is an immutable
 * movement row and the current level is the sum of the ledger. Reads go through
 * the Data API (signed-in users may read); every write goes through a
 * fixed-search-path SECURITY DEFINER RPC that re-checks permissions.
 *
 * Consumption is produced server-side when a PREVIEW food order first becomes
 * `delivered`; it never touches real requests, charges or payments.
 */
import { supabase } from "@/integrations/supabase/client";

export type InventoryUnit = "kg" | "l" | "unit" | "pack";
export type StockStatus = "buy" | "low" | "good";

export type InventoryStatusRow = {
  id: string;
  key: string;
  label: string;
  unit: InventoryUnit;
  active: boolean;
  preview_only: boolean;
  safety_stock: number;
  target_days: number;
  notes: string | null;
  estimated_stock: number;
  avg_daily_usage: number;
  days_remaining: number | null;
  status: StockStatus;
  recommended_quantity: number;
};

export type MovementType = "receipt" | "consumption" | "adjustment" | "waste";

export type InventoryMovement = {
  id: string;
  inventory_item_id: string;
  movement_type: MovementType;
  quantity: number;
  unit_cost: number | null;
  notes: string | null;
  source_type: string;
  source_id: string | null;
  created_at: string;
};

export type RecipeComponent = {
  service_type_id: string;
  inventory_item_id: string;
  qty_per_portion: number;
};

const num = (v: unknown) => Number(v ?? 0);

export const inventoryStatusQuery = {
  queryKey: ["inventory", "status"],
  queryFn: async (): Promise<InventoryStatusRow[]> => {
    const { data, error } = await supabase
      .from("inventory_status" as never)
      .select("*")
      .order("label");
    if (error) throw error;
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r["id"]),
      key: String(r["key"]),
      label: String(r["label"]),
      unit: r["unit"] as InventoryUnit,
      active: Boolean(r["active"]),
      preview_only: Boolean(r["preview_only"]),
      safety_stock: num(r["safety_stock"]),
      target_days: num(r["target_days"]),
      notes: (r["notes"] as string | null) ?? null,
      estimated_stock: num(r["estimated_stock"]),
      avg_daily_usage: num(r["avg_daily_usage"]),
      days_remaining: r["days_remaining"] == null ? null : num(r["days_remaining"]),
      status: (r["status"] as StockStatus) ?? "good",
      recommended_quantity: num(r["recommended_quantity"]),
    }));
  },
};

export const inventoryMovementsQuery = (itemId: string) => ({
  queryKey: ["inventory", "movements", itemId],
  queryFn: async (): Promise<InventoryMovement[]> => {
    const { data, error } = await supabase
      .from("inventory_movements" as never)
      .select("*")
      .eq("inventory_item_id", itemId)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw error;
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r["id"]),
      inventory_item_id: String(r["inventory_item_id"]),
      movement_type: r["movement_type"] as MovementType,
      quantity: num(r["quantity"]),
      unit_cost: r["unit_cost"] == null ? null : num(r["unit_cost"]),
      notes: (r["notes"] as string | null) ?? null,
      source_type: String(r["source_type"] ?? "manual"),
      source_id: (r["source_id"] as string | null) ?? null,
      created_at: String(r["created_at"]),
    }));
  },
});

export const recipeComponentsQuery = {
  queryKey: ["inventory", "recipes"],
  queryFn: async (): Promise<RecipeComponent[]> => {
    const { data, error } = await supabase
      .from("inventory_recipe_components" as never)
      .select("service_type_id, inventory_item_id, qty_per_portion");
    if (error) throw error;
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      service_type_id: String(r["service_type_id"]),
      inventory_item_id: String(r["inventory_item_id"]),
      qty_per_portion: num(r["qty_per_portion"]),
    }));
  },
};

/* ---------------- writes ---------------- */

export async function receiveStock(
  itemId: string,
  quantity: number,
  unitCost: number | null,
  notes: string,
) {
  const { error } = await supabase.rpc("inventory_receive" as never, {
    p_item_id: itemId,
    p_quantity: quantity,
    p_unit_cost: unitCost,
    p_notes: notes,
  } as never);
  if (error) throw error;
}

/** Writes the DIFFERENCE as an adjustment movement; history is never rewritten. */
export async function adjustStock(itemId: string, actualQuantity: number, notes: string) {
  const { error } = await supabase.rpc("inventory_adjust" as never, {
    p_item_id: itemId,
    p_actual_quantity: actualQuantity,
    p_notes: notes,
  } as never);
  if (error) throw error;
}

export async function recordWaste(itemId: string, quantity: number, notes: string) {
  const { error } = await supabase.rpc("inventory_waste" as never, {
    p_item_id: itemId,
    p_quantity: quantity,
    p_notes: notes,
  } as never);
  if (error) throw error;
}

export async function saveRecipe(
  serviceTypeId: string,
  components: { inventory_item_id: string; qty_per_portion: number }[],
) {
  const { error } = await supabase.rpc("inventory_set_recipe" as never, {
    p_service_type_id: serviceTypeId,
    p_components: components,
  } as never);
  if (error) throw error;
}

/* ---------------- helpers ---------------- */

export function inventoryErrorKey(raw: string): string {
  if (raw.includes("PERMISSION_DENIED")) return "adminOnly";
  if (raw.includes("QUANTITY_INVALID")) return "stockQuantityInvalid";
  if (raw.includes("NO_CHANGE")) return "stockNoChange";
  return "";
}

/** Rounded to 2 decimals, trailing zeros trimmed — quantities are estimates. */
export function qty(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function statusRank(status: StockStatus): number {
  return status === "buy" ? 0 : status === "low" ? 1 : 2;
}
