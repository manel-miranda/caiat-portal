import { t } from "@/lib/i18n";
import { todayISO } from "@/lib/format";
import type { RequestRow, StayRow } from "@/lib/queries";

export type TaskGroupKey = "approvals" | "requests" | "arrivals" | "departures";

export type TaskItem = {
  id: string;
  title: string;
  detail: string;
  /** Route to open when the row is tapped. */
  to: string;
  params?: { id: string };
  overdue?: boolean;
};

export type TaskGroup = {
  key: TaskGroupKey;
  label: string;
  items: TaskItem[];
};

/**
 * Current work needing action for the signed-in role. There is no read state:
 * an item disappears as soon as the underlying record is resolved.
 */
export function buildTasks(input: {
  canApprove: boolean;
  stays: StayRow[];
  requests: RequestRow[];
  pendingReservations: StayRow[];
  /** Preview-only food orders still waiting to be accepted. */
  pendingFoodOrders?: { id: string; room_label: string | null; guest_first_name: string | null }[];
  today?: string;
  now?: Date;
}): TaskGroup[] {
  const today = input.today ?? todayISO();
  const now = input.now ?? new Date();
  const groups: TaskGroup[] = [];

  // Only users allowed to manage reservations accept or reject requests.
  if (input.canApprove) {
    const items = input.pendingReservations.map((s) => ({
      id: `res:${s.id}`,
      title: s.guest?.full_name ?? "—",
      detail: `${s.room?.name ?? ""} · ${s.check_in} → ${s.check_out}`,
      to: "/stays/$id",
      params: { id: s.id },
      // An enquiry whose arrival date has already come is urgent.
      overdue: s.check_in <= today,
    }));
    if (items.length) groups.push({ key: "approvals", label: t("taskApprovals"), items });
  }

  const pendingRequests = input.requests
    .filter((r) => r.status === "pending")
    .map((r) => ({
      id: `req:${r.id}`,
      title: r.label,
      detail: [r.room?.name, r.stay?.guest?.full_name].filter(Boolean).join(" · "),
      to: "/requests",
      overdue: Boolean(r.scheduled_at && new Date(r.scheduled_at).getTime() <= now.getTime()),
    }));
  if (pendingRequests.length)
    groups.push({ key: "requests", label: t("taskGuestRequests"), items: pendingRequests });

  const operational = input.stays.filter(
    (s) => s.status === "active" && s.confirmation_status === "confirmed",
  );

  const arrivals = operational
    .filter((s) => s.check_in === today)
    .map((s) => ({
      id: `arr:${s.id}`,
      title: s.guest?.full_name ?? "—",
      detail: s.room?.name ?? "",
      to: "/stays/$id",
      params: { id: s.id },
    }));
  if (arrivals.length) groups.push({ key: "arrivals", label: t("taskArrivals"), items: arrivals });

  // A same-day turnover stay is already counted as an arrival; never twice.
  const arrivalIds = new Set(operational.filter((s) => s.check_in === today).map((s) => s.id));
  const departures = operational
    .filter((s) => s.check_out === today && !arrivalIds.has(s.id))
    .map((s) => ({
      id: `dep:${s.id}`,
      title: s.guest?.full_name ?? "—",
      detail: s.room?.name ?? "",
      to: "/stays/$id",
      params: { id: s.id },
      overdue: true,
    }));
  if (departures.length)
    groups.push({ key: "departures", label: t("taskDepartures"), items: departures });

  // Urgent work first, keeping each group's internal order.
  return groups.sort((a, b) => Number(hasOverdue(b)) - Number(hasOverdue(a)));
}

function hasOverdue(group: TaskGroup) {
  return group.items.some((i) => i.overdue);
}

export function taskCount(groups: TaskGroup[]) {
  return groups.reduce((sum, g) => sum + g.items.length, 0);
}
