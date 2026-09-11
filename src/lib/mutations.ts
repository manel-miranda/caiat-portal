import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { t } from "@/lib/i18n";

/** Marker written into a charge note so a request can only be billed once. */
export function requestChargeMarker(requestId: string) {
  return `[req:${requestId}]`;
}

export async function addCharge(params: {
  stayId: string;
  serviceTypeId: string | null;
  label: string;
  quantity: number;
  unitPrice: number;
  notes?: string | null | undefined;
  userId?: string | undefined;
}) {
  const { data, error } = await supabase
    .from("charges")
    .insert({
      stay_id: params.stayId,
      service_type_id: params.serviceTypeId,
      label: params.label,
      quantity: params.quantity,
      unit_price: params.unitPrice,
      notes: params.notes?.trim() || null,
      created_by: params.userId ?? null,
    })
    .select("id, total")
    .single();
  if (error) throw error;
  void logAudit(params.userId, "charge.added", "charge", data.id, {
    stay_id: params.stayId,
    label: params.label,
    total: data.total,
  });
  return data;
}

export async function addPayment(params: {
  stayId: string;
  amount: number;
  method: "cash" | "card" | "bank_transfer";
  notes?: string | null | undefined;
  userId: string;
}) {
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new Error(t("amountPositive"));
  }
  const { data, error } = await supabase
    .from("payments")
    .insert({
      stay_id: params.stayId,
      amount: params.amount,
      method: params.method,
      notes: params.notes?.trim() || null,
      received_by: params.userId,
    })
    .select("id")
    .single();
  if (error) throw error;
  void logAudit(params.userId, "payment.recorded", "payment", data.id, {
    stay_id: params.stayId,
    amount: params.amount,
    method: params.method,
  });
  return data;
}

/** Creates guest + stay atomically with server-side validation and overlap check. */
export async function createStay(params: {
  guestName: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  numGuests: number;
  source: string;
  accommodationTotal: number;
  notes?: string | null | undefined;
  /** "confirmed" reserves the room; "pending" is only an enquiry. */
  confirmationStatus?: "confirmed" | "pending";
  /** Existing customer row to attach to; when set no new customer is created. */
  guestId?: string | null | undefined;
  phone?: string | null | undefined;
  email?: string | null | undefined;
  userId?: string | undefined;
}) {
  const confirmation = params.confirmationStatus ?? "confirmed";
  const { data, error } = await supabase.rpc("create_stay_with_guest", {
    p_guest_name: params.guestName.trim(),
    p_room_id: params.roomId,
    p_check_in: params.checkIn,
    p_check_out: params.checkOut,
    p_num_guests: params.numGuests,
    p_source: params.source as never,
    p_accommodation_total: params.accommodationTotal,
    p_notes: params.notes ?? "",
    p_confirmation_status: confirmation,
    ...(params.guestId ? { p_guest_id: params.guestId } : {}),
    ...(params.phone ? { p_phone: params.phone } : {}),
    ...(params.email ? { p_email: params.email } : {}),
  });
  if (error) throw new Error(stayErrorMessage(error.message));
  const stayId = data as unknown as string;
  void logAudit(
    params.userId,
    confirmation === "pending" ? "reservation.requested" : "stay.created",
    "stay",
    stayId,
    {
      guest: params.guestName.trim(),
      room_id: params.roomId,
      check_in: params.checkIn,
      check_out: params.checkOut,
      confirmation_status: confirmation,
    },
  );
  return stayId;
}

export type EditableStayFields = {
  guestName: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  numGuests: number;
  source: string;
  accommodationTotal: number;
  notes: string;
};

/**
 * Admin-only correction of a booking. Goes through a vetted SECURITY DEFINER
 * RPC (direct writes on stays stay revoked) which re-runs every creation rule
 * and, for confirmed stays only, the room overlap check.
 */
export async function updateStay(params: {
  stayId: string;
  next: EditableStayFields;
  before: EditableStayFields;
  userId?: string | undefined;
}) {
  const { next } = params;
  const { error } = await supabase.rpc("edit_stay", {
    p_stay_id: params.stayId,
    p_guest_name: next.guestName.trim(),
    p_room_id: next.roomId,
    p_check_in: next.checkIn,
    p_check_out: next.checkOut,
    p_num_guests: next.numGuests,
    p_source: next.source as never,
    p_accommodation_total: next.accommodationTotal,
    p_notes: next.notes ?? "",
  });
  if (error) throw new Error(editStayErrorMessage(error.message));

  // Only the fields that actually moved go into the history entry.
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(next) as (keyof EditableStayFields)[]) {
    if (params.before[key] !== next[key]) {
      changed[key] = { from: params.before[key], to: next[key] };
    }
  }
  void logAudit(params.userId, "stay.updated", "stay", params.stayId, { changed });
  return params.stayId;
}

function editStayErrorMessage(raw: string): string {
  if (raw.includes("STAY_NOT_EDITABLE")) return t("stayNotEditable");
  if (raw.includes("ADMIN_REQUIRED")) return t("adminOnly");
  if (raw.includes("STAY_NOT_FOUND")) return t("stayNotFound");
  return stayErrorMessage(raw);
}

/** Owner/admin accepts a pending reservation request (re-checked server-side). */
export async function confirmReservation(stayId: string, userId?: string) {
  const { error } = await supabase.rpc("confirm_reservation", { p_stay_id: stayId });
  if (error) throw new Error(reservationErrorMessage(error.message));
  void logAudit(userId, "reservation.confirmed", "stay", stayId, {});
}

/** Owner/admin rejects a pending reservation request. */
export async function rejectReservation(stayId: string, userId?: string) {
  const { error } = await supabase.rpc("reject_reservation", { p_stay_id: stayId });
  if (error) throw new Error(reservationErrorMessage(error.message));
  void logAudit(userId, "reservation.rejected", "stay", stayId, {});
}

function reservationErrorMessage(raw: string): string {
  if (raw.includes("ROOM_CONFLICT")) return t("roomNoLongerAvailable");
  if (raw.includes("ADMIN_REQUIRED")) return t("adminOnly");
  if (raw.includes("NOT_PENDING")) return t("notPendingAnymore");
  if (raw.includes("ROOM_CAPACITY")) return t("guestsOverCapacity");
  return stayErrorMessage(raw);
}

function stayErrorMessage(raw: string): string {
  if (raw.includes("ROOM_CAPACITY")) return t("guestsOverCapacity");
  if (raw.includes("ROOM_CONFLICT")) return t("roomConflict");
  if (raw.includes("CHECKOUT_AFTER_CHECKIN")) return t("datesInvalid");
  if (raw.includes("GUEST_NAME_REQUIRED")) return t("guestNameRequired");
  if (raw.includes("ROOM_REQUIRED")) return t("roomRequired");
  if (raw.includes("GUESTS_MIN_ONE")) return t("guestsMinOne");
  if (raw.includes("TOTAL_NON_NEGATIVE")) return t("totalNonNegative");
  return raw;
}

export async function addRequest(params: {
  stayId: string | null;
  roomId: string | null;
  serviceTypeId: string | null;
  label: string;
  scheduledAt: string | null;
  notes?: string | null | undefined;
  userId?: string | undefined;
}) {
  const { data, error } = await supabase
    .from("requests")
    .insert({
      stay_id: params.stayId,
      room_id: params.roomId,
      service_type_id: params.serviceTypeId,
      label: params.label,
      scheduled_at: params.scheduledAt,
      notes: params.notes?.trim() || null,
      status: "pending",
      created_by: params.userId ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  void logAudit(params.userId, "request.created", "request", data.id, {
    stay_id: params.stayId,
    label: params.label,
  });
  return data;
}

/** Completes a request and, when asked, bills it once to the linked stay. */
export async function completeRequest(params: {
  requestId: string;
  stayId: string | null;
  label: string;
  serviceTypeId: string | null;
  unitPrice: number;
  withCharge: boolean;
  userId?: string | undefined;
}) {
  if (params.withCharge && params.stayId) {
    const marker = requestChargeMarker(params.requestId);
    const { data: existing } = await supabase
      .from("charges")
      .select("id")
      .eq("stay_id", params.stayId)
      .like("notes", `%${marker}%`)
      .limit(1);
    if (!existing?.length) {
      await addCharge({
        stayId: params.stayId,
        serviceTypeId: params.serviceTypeId,
        label: params.label,
        quantity: 1,
        unitPrice: params.unitPrice,
        notes: marker,
        userId: params.userId,
      });
    }
  }
  const { error } = await supabase
    .from("requests")
    .update({
      status: "completed",
      completed_by: params.userId ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", params.requestId);
  if (error) throw error;
  void logAudit(params.userId, "request.completed", "request", params.requestId, {
    billed: params.withCharge,
  });
}

export async function cancelRequest(requestId: string, userId?: string) {
  const { error } = await supabase
    .from("requests")
    .update({
      status: "cancelled",
      completed_by: userId ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (error) throw error;
  void logAudit(userId, "request.cancelled", "request", requestId, {});
}

export async function checkoutStay(params: {
  stayId: string;
  outstanding: number;
  override: boolean;
  userId?: string | undefined;
}) {
  // Server recomputes the balance: staff can only close a fully paid stay,
  // an admin needs an explicit override to close one with a balance.
  const { error } = await supabase.rpc("checkout_stay", {
    p_stay_id: params.stayId,
    p_override: params.override,
  });
  if (error) throw new Error(checkoutErrorMessage(error.message));
  void logAudit(params.userId, "stay.checked_out", "stay", params.stayId, {
    outstanding: params.outstanding,
    admin_override: params.override,
  });
}

function checkoutErrorMessage(raw: string): string {
  if (raw.includes("OUTSTANDING_BALANCE") || raw.includes("OVERRIDE_REQUIRED")) {
    return t("outstandingBlocked");
  }
  if (raw.includes("STAY_NOT_ACTIVE")) return t("checkoutDone");
  return raw;
}

/** Insert or update the cash count for a business date (admin only via RLS). */
export async function saveCashCount(params: {
  date: string;
  expectedTotal: number;
  countedTotal: number;
  notes?: string | null | undefined;
  existingId?: string | null | undefined;
  userId: string;
}) {
  const row = {
    business_date: params.date,
    expected_total: params.expectedTotal,
    counted_total: params.countedTotal,
    notes: params.notes?.trim() || null,
    closed_by: params.userId,
    closed_at: new Date().toISOString(),
  };

  const query = params.existingId
    ? supabase.from("cash_reconciliations").update(row).eq("id", params.existingId)
    : supabase.from("cash_reconciliations").insert(row);

  const { data, error } = await query.select("id, difference").single();
  if (error) throw error;

  void logAudit(params.userId, "cash.reconciled", "cash_reconciliation", data.id, {
    business_date: params.date,
    expected_total: params.expectedTotal,
    counted_total: params.countedTotal,
    difference: data.difference,
  });
  return data;
}
