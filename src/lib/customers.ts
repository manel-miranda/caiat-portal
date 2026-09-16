import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { t } from "@/lib/i18n";

/**
 * Customers are the existing `guests` rows: every historical stay keeps its
 * link, and rows are never merged automatically — two people can share a name.
 */
export type CustomerStay = {
  id: string;
  check_in: string;
  check_out: string;
  status: string;
  confirmation_status: string;
  accommodation_total: number;
  room_id: string;
};

export type CustomerRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  nationality: string | null;
  notes: string | null;
  created_at: string;
  stays: CustomerStay[];
};

const CUSTOMER_SELECT =
  "id, full_name, phone, email, nationality, notes, created_at, stays(id, check_in, check_out, status, confirmation_status, accommodation_total, room_id)";

export const customersQuery = queryOptions({
  queryKey: ["customers"],
  queryFn: async (): Promise<CustomerRow[]> => {
    const { data, error } = await supabase
      .from("guests")
      .select(CUSTOMER_SELECT)
      .order("full_name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as CustomerRow[];
  },
});

export function customerQuery(id: string) {
  return queryOptions({
    queryKey: ["customer", id],
    queryFn: async (): Promise<CustomerRow | null> => {
      const { data, error } = await supabase
        .from("guests")
        .select(CUSTOMER_SELECT)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as CustomerRow) ?? null;
    },
  });
}

/** Financial summary for a customer detail page. */
export function customerFinancialsQuery(id: string) {
  return queryOptions({
    queryKey: ["customer", id, "money"],
    queryFn: async () => {
      const [{ data: charges, error: e1 }, { data: payments, error: e2 }] = await Promise.all([
        supabase
          .from("charges")
          .select("total, stay:stays!inner(guest_id)")
          .eq("stays.guest_id", id),
        supabase
          .from("payments")
          .select("amount, stay:stays!inner(guest_id)")
          .eq("stays.guest_id", id),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return {
        charges: (charges ?? []).reduce((s, c) => s + Number(c.total ?? 0), 0),
        paid: (payments ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0),
      };
    },
  });
}

/** Counts a customer's real stays (rejected enquiries do not count). */
export function countedStays(customer: Pick<CustomerRow, "stays">): CustomerStay[] {
  return (customer.stays ?? []).filter(
    (s) => s.confirmation_status !== "rejected" && s.status !== "cancelled",
  );
}

export function isReturning(customer: Pick<CustomerRow, "stays">): boolean {
  return countedStays(customer).length > 1;
}

export function matchesCustomer(customer: CustomerRow, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return [customer.full_name, customer.phone ?? "", customer.email ?? ""].some((v) =>
    v.toLowerCase().includes(q),
  );
}

export async function createCustomer(params: {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  nationality?: string | null;
  notes?: string | null;
  userId?: string | undefined;
}): Promise<string> {
  const { data, error } = await supabase.rpc("customer_upsert", {
    p_full_name: params.fullName.trim(),
    // Generated arg types are non-nullable, but the SQL parameters accept NULL.
    p_phone: (params.phone ?? null) as string,
    p_email: (params.email ?? null) as string,
    p_nationality: (params.nationality ?? null) as string,
    p_notes: (params.notes ?? null) as string,
  });
  if (error) throw new Error(customerError(error.message));
  return data as unknown as string;
}

export async function updateCustomer(params: {
  id: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  nationality?: string | null;
  notes?: string | null;
  userId?: string | undefined;
}) {
  const { error } = await supabase.rpc("customer_update_profile", {
    p_guest_id: params.id,
    p_full_name: params.fullName.trim(),
    p_phone: (params.phone ?? null) as string,
    p_email: (params.email ?? null) as string,
    p_nationality: (params.nationality ?? null) as string,
    p_notes: (params.notes ?? null) as string,
  });
  if (error) throw new Error(customerError(error.message));
}

export function customerError(message: string): string {
  if (message.includes("PERMISSION_DENIED")) return t("permissionDenied");
  if (message.includes("GUEST_NAME_REQUIRED")) return t("guestNameRequired");
  if (message.includes("MERGE_INVALID_TARGET")) return t("mergeConfirmTitle");
  if (message.includes("CUSTOMER_NOT_FOUND")) return t("noCustomers");
  return message;
}

/* ---------------------------------------------------------------- duplicates */

/** Case/spacing-insensitive comparison key for names and emails. */
export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Digits-only comparison key so "+212 6 12" and "0612" can still match. */
export function normalizePhone(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length > 6 ? digits.slice(-9) : digits;
}

export type MatchReason = "email" | "phone" | "name";

export type DuplicateCandidate = { customer: CustomerRow; reason: MatchReason };

/**
 * Finds records that look like the same person. Exact contact matches rank
 * first; a name-only match is a hint, never grounds for an automatic merge.
 */
export function findDuplicateCandidates(
  all: CustomerRow[],
  probe: { id?: string; full_name?: string | null; phone?: string | null; email?: string | null },
): DuplicateCandidate[] {
  const name = normalizeText(probe.full_name);
  const email = normalizeText(probe.email);
  const phone = normalizePhone(probe.phone);
  const out: DuplicateCandidate[] = [];
  for (const c of all) {
    if (probe.id && c.id === probe.id) continue;
    let reason: MatchReason | null = null;
    if (email && normalizeText(c.email) === email) reason = "email";
    else if (phone && normalizePhone(c.phone) === phone) reason = "phone";
    else if (name && name.length >= 3 && normalizeText(c.full_name) === name) reason = "name";
    if (reason) out.push({ customer: c, reason });
  }
  const rank: Record<MatchReason, number> = { email: 0, phone: 1, name: 2 };
  return out.sort((a, b) => rank[a.reason] - rank[b.reason]);
}

export function matchReasonKey(reason: MatchReason) {
  return reason === "email" ? "matchByEmail" : reason === "phone" ? "matchByPhone" : "matchByName";
}

/** Atomic server-side merge; the kept record absorbs stays and blank fields. */
export async function mergeCustomers(keepId: string, mergeId: string): Promise<string> {
  const { data, error } = await supabase.rpc("merge_customers", {
    p_keep_id: keepId,
    p_merge_id: mergeId,
  });
  if (error) throw new Error(customerError(error.message));
  return data as unknown as string;
}

export { logAudit };
