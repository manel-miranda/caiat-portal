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

/* ---------------- suppliers & purchases ---------------- */

export type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  location: string | null;
  notes: string | null;
  active: boolean;
};

export type PurchaseLine = {
  id: string;
  purchase_id: string;
  inventory_item_id: string;
  quantity: number;
  line_total: number;
};

export type Purchase = {
  id: string;
  supplier_id: string | null;
  purchase_date: string;
  notes: string | null;
  total_cost: number;
  line_count: number;
  created_at: string;
};

export const suppliersQuery = {
  queryKey: ["inventory", "suppliers"],
  queryFn: async (): Promise<Supplier[]> => {
    const { data, error } = await supabase
      .from("suppliers" as never)
      .select("id, name, phone, location, notes, active")
      .order("name");
    if (error) throw error;
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r["id"]),
      name: String(r["name"]),
      phone: (r["phone"] as string | null) ?? null,
      location: (r["location"] as string | null) ?? null,
      notes: (r["notes"] as string | null) ?? null,
      active: Boolean(r["active"]),
    }));
  },
};

export const purchasesQuery = {
  queryKey: ["inventory", "purchases"],
  queryFn: async (): Promise<Purchase[]> => {
    const { data, error } = await supabase
      .from("purchases" as never)
      .select("id, supplier_id, purchase_date, notes, total_cost, line_count, created_at")
      .order("purchase_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r["id"]),
      supplier_id: (r["supplier_id"] as string | null) ?? null,
      purchase_date: String(r["purchase_date"]),
      notes: (r["notes"] as string | null) ?? null,
      total_cost: num(r["total_cost"]),
      line_count: Number(r["line_count"] ?? 0),
      created_at: String(r["created_at"]),
    }));
  },
};

export const purchaseLinesQuery = (purchaseId: string) => ({
  queryKey: ["inventory", "purchase-lines", purchaseId],
  queryFn: async (): Promise<PurchaseLine[]> => {
    const { data, error } = await supabase
      .from("purchase_lines" as never)
      .select("id, purchase_id, inventory_item_id, quantity, line_total")
      .eq("purchase_id", purchaseId);
    if (error) throw error;
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r["id"]),
      purchase_id: String(r["purchase_id"]),
      inventory_item_id: String(r["inventory_item_id"]),
      quantity: num(r["quantity"]),
      line_total: num(r["line_total"]),
    }));
  },
});

export async function saveSupplier(input: {
  id: string | null;
  name: string;
  phone: string;
  location: string;
  notes: string;
  active: boolean;
}) {
  const { error } = await supabase.rpc(
    "supplier_upsert" as never,
    {
      p_id: input.id,
      p_name: input.name,
      p_phone: input.phone,
      p_location: input.location,
      p_notes: input.notes,
      p_active: input.active,
    } as never,
  );
  if (error) throw error;
}

export async function setSupplierActive(id: string, active: boolean) {
  const { error } = await supabase.rpc(
    "supplier_set_active" as never,
    {
      p_id: id,
      p_active: active,
    } as never,
  );
  if (error) throw error;
}

/** Atomic: purchase header + lines + positive receipt movements in one RPC. */
export async function createPurchase(input: {
  id?: string;
  supplierId: string | null;
  purchaseDate: string;
  notes: string;
  lines: { inventory_item_id: string; quantity: number; line_total: number }[];
}) {
  const { error } = await supabase.rpc(
    "purchase_create" as never,
    {
      p_purchase_id: input.id ?? crypto.randomUUID(),
      p_supplier_id: input.supplierId,
      p_purchase_date: input.purchaseDate,
      p_notes: input.notes,
      p_lines: input.lines,
    } as never,
  );
  if (error) throw error;
}

/* ---------------- writes ---------------- */

export async function receiveStock(
  itemId: string,
  quantity: number,
  unitCost: number | null,
  notes: string,
) {
  const { error } = await supabase.rpc(
    "inventory_receive" as never,
    {
      p_item_id: itemId,
      p_quantity: quantity,
      p_unit_cost: unitCost,
      p_notes: notes,
    } as never,
  );
  if (error) throw error;
}

/** Writes the DIFFERENCE as an adjustment movement; history is never rewritten. */
export async function adjustStock(itemId: string, actualQuantity: number, notes: string) {
  const { error } = await supabase.rpc(
    "inventory_adjust" as never,
    {
      p_item_id: itemId,
      p_actual_quantity: actualQuantity,
      p_notes: notes,
    } as never,
  );
  if (error) throw error;
}

export async function recordWaste(itemId: string, quantity: number, notes: string) {
  const { error } = await supabase.rpc(
    "inventory_waste" as never,
    {
      p_item_id: itemId,
      p_quantity: quantity,
      p_notes: notes,
    } as never,
  );
  if (error) throw error;
}

export async function saveRecipe(
  serviceTypeId: string,
  components: { inventory_item_id: string; qty_per_portion: number }[],
) {
  const { error } = await supabase.rpc(
    "inventory_set_recipe" as never,
    {
      p_service_type_id: serviceTypeId,
      p_components: components,
    } as never,
  );
  if (error) throw error;
}

/* ---------------- helpers ---------------- */

export function inventoryErrorKey(raw: string): string {
  if (raw.includes("PERMISSION_DENIED")) return "adminOnly";
  if (raw.includes("QUANTITY_INVALID")) return "stockQuantityInvalid";
  if (raw.includes("NO_CHANGE")) return "stockNoChange";
  if (raw.includes("NAME_REQUIRED")) return "supplierNameRequired";
  if (raw.includes("LINES_REQUIRED") || raw.includes("INVALID_PURCHASE_LINE")) {
    return "purchaseLinesRequired";
  }
  return "";
}

/** Rounded to 2 decimals, trailing zeros trimmed — quantities are estimates. */
export function qty(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function statusRank(status: StockStatus): number {
  return status === "buy" ? 0 : status === "low" ? 1 : 2;
}
