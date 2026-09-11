import { supabase } from "@/integrations/supabase/client";
import { businessDayRange, todayISO } from "./format";

export type Room = {
  id: string;
  number: string;
  name: string;
  capacity: number;
  base_price: number;
  sort_order: number;
  included_guests: number;
  extra_guest_price: number;
  breakfast_included: boolean;
  amenities: string[];
};

/** Nightly rate for a room at a given occupancy (breakfast is always included). */
export function nightlyRate(room: Room, guests: number) {
  const extra = Math.max(0, guests - (room.included_guests ?? 2));
  return Number(room.base_price) + extra * Number(room.extra_guest_price ?? 0);
}

/** Suggested accommodation total: nights x nightly rate, stays are [check_in, check_out). */
export function suggestedAccommodationTotal(room: Room, guests: number, nights: number) {
  if (nights <= 0) return 0;
  return nightlyRate(room, guests) * nights;
}

export type ServiceType = {
  id: string;
  key: string;
  label: string;
  default_price: number;
  billable: boolean;
  requestable: boolean;
  sort_order: number;
  category: string;
  activity_mode: string | null;
  difficulty: string | null;
};

export type StayRow = {
  id: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  source: string;
  accommodation_total: number;
  notes: string | null;
  status: string;
  checked_out_at: string | null;
  created_at: string;
  room_id: string;
  guest_id: string;
  guest: { id: string; full_name: string; phone: string | null; nationality: string | null } | null;
  room: { id: string; number: string; name: string } | null;
  charges: { total: number }[];
  payments: { amount: number }[];
};

const STAY_SELECT =
  "id, check_in, check_out, num_guests, source, accommodation_total, notes, status, checked_out_at, created_at, room_id, guest_id, guest:guests(id, full_name, phone, nationality), room:rooms(id, number, name), charges(total), payments(amount)";

export function stayTotals(stay: {
  accommodation_total: number;
  charges: { total: number }[];
  payments: { amount: number }[];
}) {
  const chargesTotal = (stay.charges ?? []).reduce((s, c) => s + Number(c.total ?? 0), 0);
  const total = Number(stay.accommodation_total ?? 0) + chargesTotal;
  const paid = (stay.payments ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);
  return { chargesTotal, total, paid, outstanding: Math.max(0, total - paid) };
}

export const roomsQuery = {
  queryKey: ["rooms"],
  queryFn: async (): Promise<Room[]> => {
    const { data, error } = await supabase.from("rooms").select("*").order("sort_order");
    if (error) throw error;
    return data as unknown as Room[];
  },
};

export const serviceTypesQuery = {
  queryKey: ["service_types"],
  queryFn: async (): Promise<ServiceType[]> => {
    const { data, error } = await supabase
      .from("service_types")
      .select("*")
      .eq("active", true)
      .order("sort_order");
    if (error) throw error;
    return data as unknown as ServiceType[];
  },
};

export const activeStaysQuery = {
  queryKey: ["stays", "active"],
  queryFn: async (): Promise<StayRow[]> => {
    const { data, error } = await supabase
      .from("stays")
      .select(STAY_SELECT)
      .eq("status", "active")
      .order("check_in");
    if (error) throw error;
    return data as unknown as StayRow[];
  },
};

export const allStaysQuery = {
  queryKey: ["stays", "all"],
  queryFn: async (): Promise<StayRow[]> => {
    const { data, error } = await supabase
      .from("stays")
      .select(STAY_SELECT)
      .order("check_in", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data as unknown as StayRow[];
  },
};

export function stayQuery(id: string) {
  return {
    queryKey: ["stay", id],
    // A missing stay is a normal outcome (bad link, deleted stay), not a
    // transient failure: return null instead of retrying into a stuck spinner.
    retry: false,
    queryFn: async (): Promise<StayRow | null> => {
      const { data, error } = await supabase
        .from("stays")
        .select(STAY_SELECT)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as StayRow) ?? null;
    },
  };
}

export type ChargeRow = {
  id: string;
  label: string;
  quantity: number;
  unit_price: number;
  total: number;
  notes: string | null;
  created_at: string;
  created_by: string | null;
};

export function stayChargesQuery(stayId: string) {
  return {
    queryKey: ["charges", stayId],
    queryFn: async (): Promise<ChargeRow[]> => {
      const { data, error } = await supabase
        .from("charges")
        .select("id, label, quantity, unit_price, total, notes, created_at, created_by")
        .eq("stay_id", stayId)
        .order("created_at");
      if (error) throw error;
      return data as unknown as ChargeRow[];
    },
  };
}

export type PaymentRow = {
  id: string;
  amount: number;
  method: string;
  notes: string | null;
  created_at: string;
  received_by: string | null;
  stay_id: string;
};

export function stayPaymentsQuery(stayId: string) {
  return {
    queryKey: ["payments", stayId],
    queryFn: async (): Promise<PaymentRow[]> => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount, method, notes, created_at, received_by, stay_id")
        .eq("stay_id", stayId)
        .order("created_at");
      if (error) throw error;
      return data as unknown as PaymentRow[];
    },
  };
}

export type RequestRow = {
  id: string;
  label: string;
  scheduled_at: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  stay_id: string | null;
  room_id: string | null;
  service_type_id: string | null;
  created_by: string | null;
  completed_by: string | null;
  completed_at: string | null;
  room: { number: string; name: string } | null;
  stay: { id: string; guest: { full_name: string } | null } | null;
};

const REQUEST_SELECT =
  "id, label, scheduled_at, notes, status, created_at, stay_id, room_id, service_type_id, created_by, completed_by, completed_at, room:rooms(number, name), stay:stays(id, guest:guests(full_name))";

export const requestsQuery = {
  queryKey: ["requests"],
  queryFn: async (): Promise<RequestRow[]> => {
    const { data, error } = await supabase
      .from("requests")
      .select(REQUEST_SELECT)
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .limit(200);
    if (error) throw error;
    return data as unknown as RequestRow[];
  },
};

export const profilesQuery = {
  queryKey: ["profiles"],
  queryFn: async () => {
    const { data, error } = await supabase.from("profiles").select("id, username, full_name");
    if (error) throw error;
    return data as { id: string; username: string; full_name: string }[];
  },
};

export function cashDayQuery(date: string) {
  return {
    queryKey: ["cash", date],
    queryFn: async () => {
      const { fromISO: from, toISO: to } = businessDayRange(date);
      const [{ data: pays, error: e1 }, { data: rec, error: e2 }] = await Promise.all([
        supabase
          .from("payments")
          .select("id, amount, method, received_by, created_at, stay_id")
          .eq("method", "cash")
          .gte("created_at", from)
          .lte("created_at", to),
        supabase.from("cash_reconciliations").select("*").eq("business_date", date).maybeSingle(),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return {
        payments: (pays ?? []) as unknown as PaymentRow[],
        reconciliation: rec as {
          id: string;
          expected_total: number;
          counted_total: number;
          difference: number;
          notes: string | null;
          closed_at: string;
        } | null,
      };
    },
  };
}

export const todayPaymentsQuery = {
  queryKey: ["payments", "today"],
  queryFn: async (): Promise<PaymentRow[]> => {
    const { fromISO, toISO } = businessDayRange(todayISO());
    const { data, error } = await supabase
      .from("payments")
      .select("id, amount, method, notes, created_at, received_by, stay_id")
      .gte("created_at", fromISO)
      .lte("created_at", toISO);
    if (error) throw error;
    return data as unknown as PaymentRow[];
  },
};

export const todayChargesQuery = {
  queryKey: ["charges", "today"],
  queryFn: async (): Promise<ChargeRow[]> => {
    const { fromISO, toISO } = businessDayRange(todayISO());
    const { data, error } = await supabase
      .from("charges")
      .select("id, label, quantity, unit_price, total, notes, created_at, created_by")
      .gte("created_at", fromISO)
      .lte("created_at", toISO);
    if (error) throw error;
    return data as unknown as ChargeRow[];
  },
};

export const auditQuery = {
  queryKey: ["audit"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("audit_log")
      .select("id, user_id, action, entity_type, entity_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw error;
    return data as {
      id: string;
      user_id: string | null;
      action: string;
      entity_type: string;
      entity_id: string | null;
      details: Record<string, unknown>;
      created_at: string;
    }[];
  },
};

export type RoomState = "available" | "occupied" | "arrival_today" | "departure_today";

/** Stays are [check_in, check_out): the departure date night is already free. */
export function isInHouse(stay: StayRow, today = todayISO()): boolean {
  return stay.status === "active" && stay.check_in <= today && stay.check_out > today;
}

export function roomState(stay: StayRow | undefined, today = todayISO()): RoomState {
  if (!stay) return "available";
  if (isInHouse(stay, today)) return stay.check_in === today ? "arrival_today" : "occupied";
  if (stay.check_out === today) return "departure_today";
  return "available";
}

/**
 * The stay currently tied to a room: whoever is in house tonight (arrivals
 * included), otherwise the guest who checks out today so the departure stays
 * visible until a new arrival takes the room.
 */
export function stayForRoom(stays: StayRow[], roomId: string, today = todayISO()) {
  const roomStays = stays.filter((s) => s.room_id === roomId && s.status === "active");
  return roomStays.find((s) => isInHouse(s, today)) ?? roomStays.find((s) => s.check_out === today);
}
