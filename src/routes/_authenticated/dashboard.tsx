import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BedDouble, Users, Wallet, Banknote, AlertCircle, Bell, LogIn, LogOut } from "lucide-react";
import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DashboardKpiSheet } from "@/components/DashboardKpiSheet";
import { useAuth } from "@/lib/auth";
import { confirmReservation, rejectReservation } from "@/lib/mutations";
import { methodLabel, sourceLabel } from "@/lib/i18n";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/ui/stat-card";
import { requirePermission } from "@/lib/admin-guard";
import { addDaysISO, mad, roomLabel, shortDate, timeOnly, todayISO } from "@/lib/format";
import { t } from "@/lib/i18n";
import {
  dashboardAvailableRooms,
  dashboardCashPayments,
  dashboardGuestTotal,
  dashboardOccupiedStays,
  dashboardOutstanding,
  dashboardPaymentGroups,
  dashboardRevenue,
} from "@/lib/dashboard-kpis";
import {
  activeStaysQuery,
  pendingReservationsQuery,
  requestsQuery,
  roomsQuery,
  stayTotals,
  todayChargesQuery,
  todayPaymentsQuery,
} from "@/lib/queries";

type KpiDetail = "occupancy" | "guests" | "revenue" | "payments" | "cash" | "outstanding";

export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: requirePermission("activity_view"),
  head: () => ({ meta: [{ title: "Owner dashboard — Caiat Operations" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const today = todayISO();
  const rooms = useQuery(roomsQuery);
  const stays = useQuery(activeStaysQuery);
  const requests = useQuery(requestsQuery);
  const pendingReservations = useQuery(pendingReservationsQuery);
  const queryClient = useQueryClient();
  const { user, can } = useAuth();
  const [detail, setDetail] = useState<KpiDetail | null>(null);
  const detailOpenerRef = useRef<HTMLButtonElement | null>(null);

  function openDetail(next: KpiDetail, event: MouseEvent<HTMLButtonElement>) {
    detailOpenerRef.current = event.currentTarget;
    setDetail(next);
  }

  async function decide(stayId: string, accept: boolean) {
    try {
      if (accept) await confirmReservation(stayId, user?.id);
      else await rejectReservation(stayId, user?.id);
      await queryClient.invalidateQueries();
      toast.success(accept ? t("reservationConfirmed") : t("reservationRejected"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  const payments = useQuery(todayPaymentsQuery);
  const charges = useQuery(todayChargesQuery);

  const loading =
    rooms.isLoading ||
    stays.isLoading ||
    requests.isLoading ||
    payments.isLoading ||
    charges.isLoading;
  const error = rooms.error ?? stays.error ?? requests.error ?? payments.error ?? charges.error;

  const roomList = rooms.data ?? [];
  const activeStays = stays.data ?? [];
  const occupiedStays = dashboardOccupiedStays(roomList, activeStays, today);
  const availableRooms = dashboardAvailableRooms(roomList, occupiedStays);

  const guestsStaying = dashboardGuestTotal(occupiedStays);
  const arrivals = activeStays.filter((s) => s.check_in === today);
  const departures = activeStays.filter((s) => s.check_out === today);

  const revenue = dashboardRevenue(activeStays, charges.data ?? [], today);
  const chargesToday = revenue.extras;
  const revenueToday = revenue.total;

  const paymentGroups = dashboardPaymentGroups(payments.data ?? []);
  const cashPayments = dashboardCashPayments(payments.data ?? []);
  const paymentsToday = paymentGroups.reduce((sum, group) => sum + group.total, 0);
  const cashToday = cashPayments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);

  const outstandingStays = dashboardOutstanding(activeStays);
  const outstandingTotal = outstandingStays.reduce((sum, row) => sum + row.outstanding, 0);
  const scope = t("dashboardScopeToday", { date: shortDate(today) });
  const tonightScope = t("dashboardScopeTonight", { date: shortDate(today) });

  const pending = (requests.data ?? []).filter((r) => r.status === "pending");
  // Only what is still ahead of us, within the next 24 hours. Overdue items
  // stay on the Requests screen instead.
  const now = Date.now();
  const horizon = now + 24 * 3600 * 1000;
  const next24Requests = pending.filter((r) => {
    if (!r.scheduled_at) return false;
    const at = new Date(r.scheduled_at).getTime();
    return at >= now && at <= horizon;
  });
  const tomorrowISO = addDaysISO(today, 1);
  const arrivalsTomorrow = activeStays.filter((s) => s.check_in === tomorrowISO);
  const departuresTomorrow = activeStays.filter((s) => s.check_out === tomorrowISO);

  if (error) {
    return (
      <AppShell title={t("navDashboard")}>
        <p className="surface-card p-3 sm:p-4 text-sm text-destructive">
          {(error as Error).message}
        </p>
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell title={t("navDashboard")}>
        <p className="surface-card p-3 sm:p-4 text-sm text-muted-foreground">{t("loading")}</p>
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
          onClick={(event) => openDetail("occupancy", event)}
          expanded={detail === "occupancy"}
          controls="dashboard-kpi-occupancy"
        />
        <StatCard
          icon={<Users className="size-4" />}
          label={t("guestsStaying")}
          value={guestsStaying}
          onClick={(event) => openDetail("guests", event)}
          expanded={detail === "guests"}
          controls="dashboard-kpi-guests"
        />
        <StatCard
          icon={<Wallet className="size-4" />}
          label={t("revenueToday")}
          value={mad(revenueToday)}
          hint={`${mad(chargesToday)} ${t("extras")}`}
          onClick={(event) => openDetail("revenue", event)}
          expanded={detail === "revenue"}
          controls="dashboard-kpi-revenue"
        />
        <StatCard
          icon={<Banknote className="size-4" />}
          label={t("paymentsToday")}
          value={mad(paymentsToday)}
          tone="success"
          onClick={(event) => openDetail("payments", event)}
          expanded={detail === "payments"}
          controls="dashboard-kpi-payments"
        />
      </section>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {can("cash_reconcile") ? (
          <StatCard
            icon={<Banknote className="size-4" />}
            label={t("expectedInSafe")}
            value={mad(cashToday)}
            hint={t("cashControl")}
            onClick={(event) => openDetail("cash", event)}
            expanded={detail === "cash"}
            controls="dashboard-kpi-cash"
          />
        ) : null}
        <StatCard
          icon={<AlertCircle className="size-4" />}
          label={t("outstandingBalances")}
          value={mad(outstandingTotal)}
          tone={outstandingTotal > 0 ? "warning" : "default"}
          hint={`${outstandingStays.length} ${t("stay").toLowerCase()}`}
          onClick={(event) => openDetail("outstanding", event)}
          expanded={detail === "outstanding"}
          controls="dashboard-kpi-outstanding"
        />
      </div>

      <DashboardKpiSheet
        open={detail === "occupancy"}
        onOpenChange={(open) => !open && setDetail(null)}
        title={t("occupancy")}
        scope={tonightScope}
        openerRef={detailOpenerRef}
        contentId="dashboard-kpi-occupancy"
      >
        <DetailGroup
          title={`${t("occupiedRooms")} · ${occupiedStays.length}`}
          empty={occupiedStays.length === 0}
          emptyText={t("noOccupiedRooms")}
        >
          {occupiedStays.map((stay) => (
            <StayDetailLink
              key={stay.id}
              stayId={stay.id}
              title={`${roomLabel(stay.room)} · ${stay.guest?.full_name ?? "—"}`}
              meta={`${shortDate(stay.check_in)} – ${shortDate(stay.check_out)}`}
            />
          ))}
        </DetailGroup>
        <DetailGroup
          title={`${t("availableRooms")} · ${availableRooms.length}`}
          empty={availableRooms.length === 0}
          emptyText={t("noAvailableRooms")}
        >
          {availableRooms.map((room) => (
            <div key={room.id} className="flex items-center justify-between py-3 text-sm">
              <span className="font-medium">{roomLabel(room)}</span>
              <span className="text-success">{t("available")}</span>
            </div>
          ))}
        </DetailGroup>
      </DashboardKpiSheet>

      <DashboardKpiSheet
        open={detail === "guests"}
        onOpenChange={(open) => !open && setDetail(null)}
        title={t("guestsStaying")}
        scope={tonightScope}
        openerRef={detailOpenerRef}
        contentId="dashboard-kpi-guests"
      >
        <DetailGroup
          title={`${t("guests")} · ${guestsStaying}`}
          empty={occupiedStays.length === 0}
          emptyText={t("noGuestsStaying")}
        >
          {occupiedStays.map((stay) => (
            <StayDetailLink
              key={stay.id}
              stayId={stay.id}
              title={`${stay.guest?.full_name ?? "—"} · ${roomLabel(stay.room)}`}
              meta={`${stay.num_guests} ${t("pax")}`}
              amount={String(stay.num_guests)}
            />
          ))}
        </DetailGroup>
      </DashboardKpiSheet>

      <DashboardKpiSheet
        open={detail === "revenue"}
        onOpenChange={(open) => !open && setDetail(null)}
        title={t("revenueToday")}
        scope={scope}
        description={t("revenueTodayExplanation")}
        openerRef={detailOpenerRef}
        contentId="dashboard-kpi-revenue"
      >
        <DetailGroup
          title={t("accommodationArrivals")}
          total={mad(revenue.accommodation)}
          empty={revenue.accommodationRows.length === 0}
          emptyText={t("noAccommodationToday")}
        >
          {revenue.accommodationRows.map((stay) => (
            <StayDetailLink
              key={stay.id}
              stayId={stay.id}
              title={`${stay.guest?.full_name ?? "—"} · ${roomLabel(stay.room)}`}
              meta={`${shortDate(stay.check_in)} – ${shortDate(stay.check_out)}`}
              amount={mad(stay.accommodation_total)}
            />
          ))}
        </DetailGroup>
        <DetailGroup
          title={t("extrasRecordedToday")}
          total={mad(revenue.extras)}
          empty={revenue.extraRows.length === 0}
          emptyText={t("noExtrasToday")}
        >
          {revenue.extraRows.map((charge) => (
            <DetailRow
              key={charge.id}
              title={charge.label}
              meta={`${charge.quantity} × · ${timeOnly(charge.created_at)}`}
              amount={mad(charge.total)}
            />
          ))}
        </DetailGroup>
        <DetailTotal label={t("total")} value={mad(revenue.total)} />
      </DashboardKpiSheet>

      <DashboardKpiSheet
        open={detail === "payments"}
        onOpenChange={(open) => !open && setDetail(null)}
        title={t("paymentsToday")}
        scope={scope}
        openerRef={detailOpenerRef}
        contentId="dashboard-kpi-payments"
      >
        {paymentGroups.length === 0 ? (
          <EmptyDetail>{t("noPaymentsToday")}</EmptyDetail>
        ) : (
          paymentGroups.map((group) => (
            <DetailGroup
              key={group.method}
              title={methodLabel(group.method)}
              total={mad(group.total)}
              empty={false}
              emptyText=""
            >
              {group.rows.map((payment) => {
                const knownStay = activeStays.find((stay) => stay.id === payment.stay_id);
                return (
                  <StayDetailLink
                    key={payment.id}
                    stayId={payment.stay_id}
                    title={
                      knownStay
                        ? `${knownStay.guest?.full_name ?? "—"} · ${roomLabel(knownStay.room)}`
                        : t("openStay")
                    }
                    meta={timeOnly(payment.created_at)}
                    amount={mad(payment.amount)}
                  />
                );
              })}
            </DetailGroup>
          ))
        )}
        {paymentGroups.length > 0 ? (
          <DetailTotal label={t("total")} value={mad(paymentsToday)} />
        ) : null}
      </DashboardKpiSheet>

      {can("cash_reconcile") ? (
        <DashboardKpiSheet
          open={detail === "cash"}
          onOpenChange={(open) => !open && setDetail(null)}
          title={t("expectedInSafe")}
          scope={scope}
          description={t("cashTodayExplanation")}
          openerRef={detailOpenerRef}
          contentId="dashboard-kpi-cash"
        >
          <DetailGroup
            title={t("cash")}
            total={mad(cashToday)}
            empty={cashPayments.length === 0}
            emptyText={t("noCashToday")}
          >
            {cashPayments.map((payment) => {
              const knownStay = activeStays.find((stay) => stay.id === payment.stay_id);
              return (
                <StayDetailLink
                  key={payment.id}
                  stayId={payment.stay_id}
                  title={
                    knownStay
                      ? `${knownStay.guest?.full_name ?? "—"} · ${roomLabel(knownStay.room)}`
                      : t("openStay")
                  }
                  meta={timeOnly(payment.created_at)}
                  amount={mad(payment.amount)}
                />
              );
            })}
          </DetailGroup>
          <Button asChild className="mt-5 w-full">
            <Link to="/cash">{t("openCashControl")}</Link>
          </Button>
        </DashboardKpiSheet>
      ) : null}

      <DashboardKpiSheet
        open={detail === "outstanding"}
        onOpenChange={(open) => !open && setDetail(null)}
        title={t("outstandingBalances")}
        scope={t("dashboardScopeActiveStays")}
        openerRef={detailOpenerRef}
        contentId="dashboard-kpi-outstanding"
      >
        <DetailGroup
          title={`${t("outstanding")} · ${outstandingStays.length}`}
          total={mad(outstandingTotal)}
          empty={outstandingStays.length === 0}
          emptyText={t("noOutstandingBalances")}
        >
          {outstandingStays.map((row) => (
            <StayDetailLink
              key={row.stay.id}
              stayId={row.stay.id}
              title={`${row.stay.guest?.full_name ?? "—"} · ${roomLabel(row.stay.room)}`}
              meta={`${t("billTotal")}: ${mad(row.total)} · ${t("paid")}: ${mad(row.paid)}`}
              amount={mad(row.outstanding)}
            />
          ))}
        </DetailGroup>
      </DashboardKpiSheet>

      <Section title={`${t("pendingReservations")} (${(pendingReservations.data ?? []).length})`}>
        <Group
          title={t("reservationRequest")}
          icon={<Bell className="size-4" />}
          empty={(pendingReservations.data ?? []).length === 0}
        >
          {(pendingReservations.data ?? []).map((s) => (
            <div key={s.id} className="px-4 py-3 text-sm">
              <Link to="/stays/$id" params={{ id: s.id }} className="block active:opacity-70">
                <p className="font-medium">
                  {s.guest?.full_name ?? "—"} · {roomLabel(s.room)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {shortDate(s.check_in)} – {shortDate(s.check_out)} · {s.num_guests} {t("pax")} ·{" "}
                  {sourceLabel(s.source)} · {mad(s.accommodation_total)}
                </p>
              </Link>
              <div className={`mt-2 flex gap-2 ${can("reservations_manage") ? "" : "hidden"}`}>
                <Button size="sm" className="rounded-lg" onClick={() => void decide(s.id, true)}>
                  {t("accept")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => void decide(s.id, false)}
                >
                  {t("reject")}
                </Button>
              </div>
            </div>
          ))}
        </Group>
      </Section>

      <Section title={t("today")}>
        <Group
          title={t("arrivals")}
          icon={<LogIn className="size-4" />}
          empty={arrivals.length === 0}
        >
          {arrivals.map((s) => (
            <Row key={s.id} to={s.id} left={s.guest?.full_name ?? "—"} right={roomLabel(s.room)} />
          ))}
        </Group>
        <Group
          title={t("departures")}
          icon={<LogOut className="size-4" />}
          empty={departures.length === 0}
        >
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
              left={`${r.stay.guest?.full_name ?? "—"} · ${roomLabel(r.stay.room)}`}
              right={mad(r.outstanding)}
            />
          ))}
        </Group>
      </Section>

      <Section title={t("next24h")}>
        <Group
          title={t("scheduledRequests")}
          icon={<Bell className="size-4" />}
          empty={next24Requests.length === 0}
        >
          {next24Requests.map((r) => (
            <Link
              key={r.id}
              to="/requests"
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm active:bg-muted"
            >
              <span className="truncate font-medium">
                {r.label}
                {r.room ? ` · ${roomLabel(r.room)}` : ""}
              </span>
              <span className="shrink-0 text-muted-foreground">{timeOnly(r.scheduled_at)}</span>
            </Link>
          ))}
        </Group>
        <Group title={t("arrivals")} empty={arrivalsTomorrow.length === 0}>
          {arrivalsTomorrow.map((s) => (
            <Row
              key={s.id}
              to={s.id}
              left={s.guest?.full_name ?? "—"}
              right={shortDate(s.check_in)}
            />
          ))}
        </Group>
        <Group title={t("departures")} empty={departuresTomorrow.length === 0}>
          {departuresTomorrow.map((s) => (
            <Row
              key={s.id}
              to={s.id}
              left={s.guest?.full_name ?? "—"}
              right={shortDate(s.check_out)}
            />
          ))}
        </Group>
      </Section>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
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
      {empty ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">{t("noResults")}</p>
      ) : (
        children
      )}
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

function DetailGroup({
  title,
  total,
  empty,
  emptyText,
  children,
}: {
  title: string;
  total?: string;
  empty: boolean;
  emptyText: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-6 last:mb-0">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {total ? <span className="shrink-0 text-sm font-semibold">{total}</span> : null}
      </div>
      {empty ? (
        <EmptyDetail>{emptyText}</EmptyDetail>
      ) : (
        <div className="divide-y divide-border">{children}</div>
      )}
    </section>
  );
}

function EmptyDetail({ children }: { children: ReactNode }) {
  return <p className="py-5 text-sm text-muted-foreground">{children}</p>;
}

function DetailRow({ title, meta, amount }: { title: string; meta: string; amount: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>
      </div>
      <span className="shrink-0 font-semibold">{amount}</span>
    </div>
  );
}

function StayDetailLink({
  stayId,
  title,
  meta,
  amount,
}: {
  stayId: string;
  title: string;
  meta: string;
  amount?: string;
}) {
  return (
    <Link
      to="/stays/$id"
      params={{ id: stayId }}
      className="flex items-center justify-between gap-3 py-3 text-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>
      </div>
      {amount ? <span className="shrink-0 font-semibold">{amount}</span> : null}
    </Link>
  );
}

function DetailTotal({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-4 flex items-center justify-between border-t-2 border-border pt-4 text-base font-semibold">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
