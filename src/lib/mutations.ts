import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";

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
    .update({ status: "cancelled", completed_by: userId ?? null, completed_at: new Date().toISOString() })
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
  const { error } = await supabase
    .from("stays")
    .update({ status: "completed", checked_out_at: new Date().toISOString() })
    .eq("id", params.stayId);
  if (error) throw error;
  void logAudit(params.userId, "stay.checked_out", "stay", params.stayId, {
    outstanding: params.outstanding,
    admin_override: params.override,
  });
}
