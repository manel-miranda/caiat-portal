export type DashboardRoom = {
  id: string;
  number: string;
  name: string;
};

export type DashboardStay = {
  id: string;
  room_id: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  accommodation_total: number;
  status: string;
  confirmation_status: string;
  guest: { full_name: string } | null;
  room: { number: string; name: string } | null;
  charges: { total: number }[];
  payments: { amount: number }[];
};

export type DashboardCharge = {
  id: string;
  label: string;
  quantity: number;
  total: number;
  created_at: string;
};

export type DashboardPayment = {
  id: string;
  amount: number;
  method: string;
  created_at: string;
  stay_id: string;
};

export function dashboardOccupiedStays(
  rooms: DashboardRoom[],
  stays: DashboardStay[],
  today: string,
) {
  return rooms.flatMap((room) => {
    const stay = stays.find(
      (candidate) =>
        candidate.room_id === room.id &&
        candidate.status === "active" &&
        candidate.confirmation_status === "confirmed" &&
        candidate.check_in <= today &&
        candidate.check_out > today,
    );
    return stay ? [stay] : [];
  });
}

export function dashboardAvailableRooms(rooms: DashboardRoom[], occupied: DashboardStay[]) {
  const occupiedRoomIds = new Set(occupied.map((stay) => stay.room_id));
  return rooms.filter((room) => !occupiedRoomIds.has(room.id));
}

export function dashboardGuestTotal(occupied: DashboardStay[]) {
  return occupied.reduce((sum, stay) => sum + Number(stay.num_guests ?? 0), 0);
}

export function dashboardRevenue(
  stays: DashboardStay[],
  charges: DashboardCharge[],
  today: string,
) {
  const accommodationRows = stays.filter(
    (stay) =>
      stay.status === "active" &&
      stay.confirmation_status === "confirmed" &&
      stay.check_in === today,
  );
  const accommodation = accommodationRows.reduce(
    (sum, stay) => sum + Number(stay.accommodation_total ?? 0),
    0,
  );
  const extras = charges.reduce((sum, charge) => sum + Number(charge.total ?? 0), 0);
  return { accommodationRows, extraRows: charges, accommodation, extras, total: accommodation + extras };
}

export function dashboardPaymentGroups(payments: DashboardPayment[]) {
  const groups = new Map<string, DashboardPayment[]>();
  for (const payment of payments) {
    groups.set(payment.method, [...(groups.get(payment.method) ?? []), payment]);
  }
  return [...groups.entries()].map(([method, rows]) => ({
    method,
    rows,
    total: rows.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0),
  }));
}

export function dashboardCashPayments(payments: DashboardPayment[]) {
  return payments.filter((payment) => payment.method === "cash");
}

export function dashboardOutstanding(stays: DashboardStay[]) {
  return stays
    .map((stay) => {
      const charges = stay.charges.reduce((sum, charge) => sum + Number(charge.total ?? 0), 0);
      const total = Number(stay.accommodation_total ?? 0) + charges;
      const paid = stay.payments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
      return { stay, total, paid, outstanding: Math.max(0, total - paid) };
    })
    .filter((row) => row.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);
}