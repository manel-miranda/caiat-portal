import { describe, expect, test } from "bun:test";
import {
  dashboardAvailableRooms,
  dashboardCashPayments,
  dashboardGuestTotal,
  dashboardOccupiedStays,
  dashboardOutstanding,
  dashboardPaymentGroups,
  dashboardRevenue,
  type DashboardPayment,
  type DashboardRoom,
  type DashboardStay,
} from "../src/lib/dashboard-kpis";

const rooms: DashboardRoom[] = [
  { id: "r1", number: "1", name: "Atlas" },
  { id: "r2", number: "2", name: "Rif" },
  { id: "r3", number: "3", name: "Sahara" },
];

function stay(
  overrides: Partial<DashboardStay> & Pick<DashboardStay, "id" | "room_id">,
): DashboardStay {
  return {
    check_in: "2026-09-13",
    check_out: "2026-09-16",
    num_guests: 2,
    accommodation_total: 300,
    status: "active",
    confirmation_status: "confirmed",
    guest: { full_name: `Guest ${overrides.id}` },
    room: { number: overrides.room_id.slice(1), name: "Room" },
    charges: [],
    payments: [],
    ...overrides,
  };
}

function payment(
  overrides: Partial<DashboardPayment> & Pick<DashboardPayment, "id">,
): DashboardPayment {
  return {
    amount: 100,
    method: "cash",
    created_at: "2026-09-14T10:00:00Z",
    stay_id: "missing-or-completed-stay",
    ...overrides,
  };
}

describe("dashboard KPI breakdowns", () => {
  test("occupancy excludes checkout-day, future and pending stays", () => {
    const occupied = dashboardOccupiedStays(
      rooms,
      [
        stay({ id: "in-house", room_id: "r1" }),
        stay({ id: "checkout", room_id: "r2", check_out: "2026-09-14" }),
        stay({ id: "future", room_id: "r2", check_in: "2026-09-15" }),
        stay({ id: "pending", room_id: "r3", confirmation_status: "pending" }),
      ],
      "2026-09-14",
    );

    expect(occupied.map((row) => row.id)).toEqual(["in-house"]);
    expect(dashboardGuestTotal(occupied)).toBe(2);
    expect(dashboardAvailableRooms(rooms, occupied).map((room) => room.id)).toEqual(["r2", "r3"]);
  });

  test("revenue preserves arrival accommodation plus today's extras semantics", () => {
    const result = dashboardRevenue(
      [
        stay({ id: "arrival", room_id: "r1", check_in: "2026-09-14", accommodation_total: 800 }),
        stay({ id: "existing", room_id: "r2", check_in: "2026-09-13", accommodation_total: 900 }),
      ],
      [
        { id: "c1", label: "Dinner", quantity: 2, total: 180, created_at: "2026-09-14T12:00:00Z" },
        { id: "c2", label: "Tea", quantity: 1, total: 20, created_at: "2026-09-14T13:00:00Z" },
      ],
      "2026-09-14",
    );

    expect(result.accommodation).toBe(800);
    expect(result.extras).toBe(200);
    expect(result.total).toBe(1000);
    expect(dashboardRevenue([], [], "2026-09-14").total).toBe(0);
  });

  test("payments retain missing or completed stays and group mixed methods", () => {
    const rows = [
      payment({ id: "p1", amount: 100, method: "cash" }),
      payment({ id: "p2", amount: 250, method: "card", stay_id: "active-stay" }),
      payment({ id: "p3", amount: 75, method: "cash", stay_id: "completed-stay" }),
    ];
    const groups = dashboardPaymentGroups(rows);

    expect(groups.map((group) => [group.method, group.total])).toEqual([
      ["cash", 175],
      ["card", 250],
    ]);
    expect(
      groups
        .flatMap((group) => group.rows)
        .map((row) => row.id)
        .sort(),
    ).toEqual(["p1", "p2", "p3"]);
    expect(dashboardCashPayments(rows).map((row) => row.id)).toEqual(["p1", "p3"]);
    expect(dashboardPaymentGroups([])).toEqual([]);
  });

  test("outstanding rows sort descending and clamp overpayments to zero", () => {
    const rows = dashboardOutstanding([
      stay({ id: "small", room_id: "r1", accommodation_total: 300, payments: [{ amount: 100 }] }),
      stay({
        id: "large",
        room_id: "r2",
        accommodation_total: 700,
        charges: [{ total: 100 }],
        payments: [{ amount: 50 }],
      }),
      stay({
        id: "overpaid",
        room_id: "r3",
        accommodation_total: 100,
        payments: [{ amount: 150 }],
      }),
    ]);

    expect(rows.map((row) => [row.stay.id, row.total, row.paid, row.outstanding])).toEqual([
      ["large", 800, 50, 750],
      ["small", 300, 100, 200],
    ]);
    expect(rows.reduce((sum, row) => sum + row.outstanding, 0)).toBe(950);
    expect(dashboardOutstanding([])).toEqual([]);
  });
});
