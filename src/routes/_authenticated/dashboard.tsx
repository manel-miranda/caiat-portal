import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BedDouble, Users, Wallet, Banknote, AlertCircle, Bell, LogIn, LogOut } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/ui/stat-card";
import { requireAdmin } from "@/lib/admin-guard";
import { mad, shortDate, timeOnly, todayISO } from "@/lib/format";
import { t } from "@/lib/i18n";
import {
  activeStaysQuery,
  requestsQuery,
  roomsQuery,
  stayForRoom,
  stayTotals,
  todayChargesQuery,
  todayPaymentsQuery,
} from "@/lib/queries";
import type { ReactNode } from "react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: requireAdmin,
  head: () => ({ meta: [{ title: "Owner dashboard — Caiat Operations" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const today = todayISO();
  const rooms = useQuery(roomsQuery);
  const stays = useQuery(activeStaysQuery);
  const requests = useQuery(requestsQuery);
  const payments = useQuery(todayPaymentsQuery);
  const charges = useQuery(todayChargesQuery);

  const loading =
    rooms.isLoading || stays.isLoading || requests.isLoading || payments.isLoading || charges.isLoading;
  const error = rooms.error ?? stays.error ?? requests.error ?? payments.error ?? charges.error;

  const roomList = rooms.data ?? [];
  const activeStays = stays.data ?? [];
  const occupiedStays = roomList
    .map((r) => stayForRoom(activeStays, r.id, today))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const guestsStaying = occupiedStays.reduce((sum, s) => sum + Number(s.num_guests ?? 0), 0);
  const arrivals = activeStays.filter((s) => s.check_in === today);
  const departures = activeStays.filter((s) => s.check_out === today);

  const chargesToday = (charges.data ?? []).reduce((sum, c) => sum + Number(c.total ?? 0), 0);
  const accommodationToday = arrivals.reduce((sum, s) => sum + Number(s.accommodation_total ?? 0), 0);
  const revenueToday = chargesToday + accommodationToday;

  const paymentsToday = (payments.data ?? []).reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const cashToday = (payments.data ?? [])
    .filter((p) => p.method === "cash")
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  const outstandingTotal = activeStays.reduce((sum, s) => sum + stayTotals(s).outstanding, 0);
  const outstandingStays = activeStays
    .map((s) => ({ stay: s, ...stayTotals(s) }))
    .filter((r) => r.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);

  const pending = (requests.data ?? []).filter((r) => r.status === "pending");
  const horizon = Date.now() + 24 * 3600 * 1000;
  const next24Requests = pending.filter(
    (r) => r.scheduled_at && new Date(r.scheduled_at).getTime() <= horizon,
  );
  const tomorrow = new Date(`${today}T00:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowISO = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  const arrivalsTomorrow = activeStays.filter((s) => s.check_in === tomorrowISO);
  const departuresTomorrow = activeStays.filter((s) => s.check_out === tomorrowISO);

  if (error) {
    return (
      <AppShell title={t("navDashboard")}>
        <p className="surface-card p-4 text-sm text-destructive">{(error as Error).message}</p>
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell title={t("navDashboard")}>
        <p className="surface-card p-4 text-sm text-muted-foreground">{t("loading")}</p>
      </AppShell>
    );
  }

  return (
    <AppShell title={t("navDashboard")}>
      <section className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<BedDouble className="size-4" />}
          label={t("occupancy")}
          value={`${occupiedStays.length}/${roomList.length || 7}`}
          hint={shortDate(today)}
        />
        <StatCard icon={<Users className="size-4" />} label={t("guestsStaying")} value={guestsStaying} />
        <StatCard
          icon={<Wallet className="size-4" />}
          label={t("revenueToday")}
          value={mad(revenueToday)}
          hint={`${mad(chargesToday)} extras`}
        />
        <StatCard
          icon={<Banknote className="size-4" />}
          label={t("paymentsToday")}
          value={mad(paymentsToday)}
          tone="success"
        />
      </section>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Link to="/cash" className="contents">
          <StatCard
            icon={<Banknote className="size-4" />}
            label={t("expectedInSafe")}
            value={mad(cashToday)}
            hint={t("cashControl")}
          />
        </Link>
        <StatCard
          icon={<AlertCircle className="size-4" />}
          label={t("outstandingBalances")}
          value={mad(outstandingTotal)}
          tone={outstandingTotal > 0 ? "warning" : "default"}
          hint={`${outstandingStays.length} ${t("stay").toLowerCase()}`}
        />
      </div>

      <Section title={t("today")}>
        <Group title={t("arrivals")} icon={<LogIn className="size-4" />} empty={arrivals.length === 0}>
          {arrivals.map((s) => (
            <Row key={s.id} to={s.id} left={s.guest?.full_name ?? "—"} right={`${t("room")} ${s.room?.number ?? ""}`} />
          ))}
        </Group>
        <Group title={t("departures")} icon={<LogOut className="size-4" />} empty={departures.length === 0}>
          {departures.map((s) => (
            <Row
              key={s.id}
              to={s.id}
              left={s.guest?.full_name ?? "—"}
              right={mad(stayTotals(s).outstanding)}
            />
          ))}
        </Group>
      </Section>

      <Section title={t("outstandingBalances")}>
        <Group title={t("outstanding")} empty={outstandingStays.length === 0}>
          {outstandingStays.map((r) => (
            <Row
              key={r.stay.id}
              to={r.stay.id}
              left={`${r.stay.guest?.full_name ?? "—"} · ${t("room")} ${r.stay.room?.number ?? ""}`}
              right={mad(r.outstanding)}
            />
          ))}
        </Group>
      </Section>

      <Section title={t("next24h")}>
        <Group title={t("scheduledRequests")} icon={<Bell className="size-4" />} empty={next24Requests.length === 0}>
          {next24Requests.map((r) => (
            <Link
              key={r.id}
              to="/requests"
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm active:bg-muted"
            >
              <span className="truncate font-medium">
                {r.label}
                {r.room ? ` · ${t("room")} ${r.room.number}` : ""}
              </span>
              <span className="shrink-0 text-muted-foreground">{timeOnly(r.scheduled_at)}</span>
            </Link>
          ))}
        </Group>
        <Group title={t("arrivals")} empty={arrivalsTomorrow.length === 0}>
          {arrivalsTomorrow.map((s) => (
            <Row key={s.id} to={s.id} left={s.guest?.full_name ?? "—"} right={shortDate(s.check_in)} />
          ))}
        </Group>
        <Group title={t("departures")} empty={departuresTomorrow.length === 0}>
          {departuresTomorrow.map((s) => (
            <Row key={s.id} to={s.id} left={s.guest?.full_name ?? "—"} right={shortDate(s.check_out)} />
          ))}
        </Group>
      </Section>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="surface-card divide-y divide-border">{children}</div>
    </section>
  );
}

function Group({
  title,
  icon,
  empty,
  children,
}: {
  title: string;
  icon?: ReactNode;
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </p>
      {empty ? <p className="px-4 py-3 text-sm text-muted-foreground">{t("noResults")}</p> : children}
    </div>
  );
}

function Row({ to, left, right }: { to: string; left: string; right: string }) {
  return (
    <Link
      to="/stays/$id"
      params={{ id: to }}
      className="flex items-center justify-between gap-3 px-4 py-3 text-sm active:bg-muted"
    >
      <span className="truncate font-medium">{left}</span>
      <span className="shrink-0 text-muted-foreground">{right}</span>
    </Link>
  );
}
