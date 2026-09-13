/**
 * Admin catalogue (menu) management.
 *
 * Reads go through the Data API (service_types is readable by every signed-in
 * user); every write goes through a fixed-search-path SECURITY DEFINER RPC that
 * re-checks the admin role server-side, so hiding the screen is convenience
 * only. Items are archived by clearing `active`, never deleted, because
 * existing charges and requests keep referencing `service_type_id`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Lang } from "./i18n";

export type LocalizedText = Partial<Record<Lang, string>>;

export type CatalogItem = {
  id: string;
  key: string;
  label: string;
  default_price: number;
  billable: boolean;
  requestable: boolean;
  active: boolean;
  guest_visible: boolean;
  /** Preview prototype: admin switch for today's availability. */
  available_today: boolean;
  /** Seeded demo/test item: never shown to real guests or on production hosts. */
  preview_only: boolean;
  category: string;
  guest_category: string | null;
  guest_subcategory: string | null;
  short_description: string | null;
  activity_mode: string | null;
  difficulty: string | null;
  display_order: number;
  sort_order: number;
  featured: boolean;
  signature: boolean;
  name_i18n: LocalizedText;
  description_i18n: LocalizedText;
};

export type CatalogRecommendation = {
  service_type_id: string;
  recommended_service_type_id: string;
  position: number;
};

export const catalogItemsQuery = {
  queryKey: ["catalog", "items"],
  queryFn: async (): Promise<CatalogItem[]> => {
    const { data, error } = await supabase
      .from("service_types")
      .select("*")
      .order("display_order")
      .order("sort_order");
    if (error) throw error;
    return (data ?? []) as unknown as CatalogItem[];
  },
};

export const catalogRecommendationsQuery = {
  queryKey: ["catalog", "recommendations"],
  queryFn: async (): Promise<CatalogRecommendation[]> => {
    const { data, error } = await supabase
      .from("service_recommendations")
      .select("service_type_id, recommended_service_type_id, position")
      .order("position");
    if (error) throw error;
    return (data ?? []) as unknown as CatalogRecommendation[];
  },
};

export type CatalogInput = {
  id: string | null;
  key: string;
  label: string;
  defaultPrice: number;
  billable: boolean;
  requestable: boolean;
  active: boolean;
  guestVisible: boolean;
  category: string;
  guestCategory: string;
  guestSubcategory: string;
  shortDescription: string;
  activityMode: string;
  difficulty: string;
  displayOrder: number;
  sortOrder: number;
  featured: boolean;
  signature: boolean;
  nameI18n: LocalizedText;
  descriptionI18n: LocalizedText;
};

/** Stable error codes the screen translates. */
export function catalogErrorKey(raw: string): string {
  if (raw.includes("KEY_TAKEN")) return "catalogueKeyTaken";
  if (raw.includes("KEY_IMMUTABLE")) return "catalogueKeyImmutable";
  if (raw.includes("KEY_INVALID") || raw.includes("KEY_REQUIRED")) return "catalogueKeyInvalid";

  if (raw.includes("TOO_MANY_RECOMMENDATIONS")) return "catalogueTooManyRecommendations";
  if (raw.includes("PERMISSION_DENIED")) return "adminOnly";
  return "";
}

export async function saveCatalogItem(input: CatalogInput): Promise<string> {
  const { data, error } = await supabase.rpc("catalog_upsert_service", {
    p_id: input.id as string,
    p_key: input.key,
    p_label: input.label,
    p_default_price: input.defaultPrice,
    p_billable: input.billable,
    p_requestable: input.requestable,
    p_active: input.active,
    p_guest_visible: input.guestVisible,
    p_category: input.category,
    p_guest_category: input.guestCategory,
    p_guest_subcategory: input.guestSubcategory,
    p_short_description: input.shortDescription,
    p_activity_mode: input.activityMode,
    p_difficulty: input.difficulty,
    p_display_order: input.displayOrder,
    p_sort_order: input.sortOrder,
    p_featured: input.featured,
    p_signature: input.signature,
    p_name_i18n: input.nameI18n as never,
    p_description_i18n: input.descriptionI18n as never,
  });
  if (error) throw error;
  return data as unknown as string;
}

export async function setCatalogItemActive(id: string, active: boolean) {
  const { error } = await supabase.rpc("catalog_set_active", { p_id: id, p_active: active });
  if (error) throw error;
}

export async function setCatalogItemAvailable(id: string, available: boolean) {
  const { error } = await supabase.rpc("catalog_set_available", {
    p_id: id,
    p_available: available,
  });
  if (error) throw error;
}

export async function setCatalogRecommendations(id: string, ids: string[]) {
  const { error } = await supabase.rpc("catalog_set_recommendations", {
    p_id: id,
    p_ids: ids,
  });
  if (error) throw error;
}

/**
 * Reverse view: the items this one should be suggested after. The RPC adds or
 * removes single rows on each source, keeping the 3-per-source cap intact.
 */
export async function setCatalogIncomingRecommendations(id: string, sourceIds: string[]) {
  const { error } = await supabase.rpc("catalog_set_incoming_recommendations" as never, {
    p_id: id,
    p_source_ids: sourceIds,
  } as never);
  if (error) throw error;
}
