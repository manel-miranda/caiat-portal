import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, LogIn, LogOut, Bell, CalendarDays } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { activeStaysQuery, requestsQuery, roomsQuery, stayForRoom, roomState } from "@/lib/queries";
import { firstName, mad, roomLabel, shortDate, todayISO, timeOnly } from "@/lib/format";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [{ title: "Rooms today — Caiat Operations" }] }),
  component: HomePage,
});

const STATE_STYLES: Record<string, string> = {
  available: "border-border bg-card",
  occupied: "border-primary/30 bg-primary/5",
  arrival_today: "border-info/40 bg-info/10",
  departure_today: "border-warning/50 bg-warning/15",
};

function stateLabel(state: string): string {
  if (state === "occupied") return t("occupied");
  if (state === "arrival_today") return t("arrivalToday");
  if (state === "departure_today") return t("departureToday");
  return t("available");
}

function HomePage() {
  const today = todayISO();
  const rooms = useQuery(roomsQuery);
  const stays = useQuery(activeStaysQuery);
  const requests = useQuery(requestsQuery);

  const allStays = stays.data ?? [];
  const arrivals = allStays.filter((s) => s.check_in === today);
  const departures = allStays.filter((s) => s.check_out === today && s.status === "active");
  const pending = (requests.data ?? []).filter((r) => r.status === "pending");

  return (
    <AppShell title={t("appName")}>
      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        <SummaryTile
          icon={<LogIn className="size-4" />}
          label={t("arrivals")}
          value={arrivals.length}
        />
        <SummaryTile
          icon={<LogOut className="size-4" />}
          label={t("departures")}
          value={departures.length}
        />
        <Link to="/requests" className="contents">
          <SummaryTile
            icon={<Bell className="size-4" />}
            label={t("pendingRequests")}
            value={pending.length}
          />
        </Link>
      </section>

      <div className="mt-4 flex items-center justify-between gap-2 sm:mt-5">
        <h2 className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:text-sm">
          {t("navRooms")}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            to="/calendar"
            aria-label={t("calendarTitle")}
            className="inline-flex size-11 items-center justify-center rounded-xl border border-border bg-card active:bg-muted sm:size-auto sm:gap-1.5 sm:rounded-full sm:px-4 sm:py-2.5 sm:text-sm sm:font-semibold"
          >
            <CalendarDays className="size-[18px] sm:size-4" />
            <span className="hidden sm:inline">{t("calendarTitle")}</span>
          </Link>
          <Link
            to="/stays/new"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground active:scale-[0.98] sm:rounded-full sm:px-4 sm:py-2.5"
          >
            <Plus className="size-4" />
            <span className="truncate">{t("newStay")}</span>
          </Link>
        </div>
      </div>

      <div className="mt-2.5 grid gap-2 sm:mt-3 sm:grid-cols-2 sm:gap-3">
        {(rooms.data ?? []).map((room) => {
          const stay = stayForRoom(allStays, room.id, today);
          const state = roomState(stay, today);
          const content = (
            <div
              className={cn(
                "flex min-h-[80px] w-full flex-col justify-between rounded-xl border p-3 text-left transition-transform active:scale-[0.99] sm:min-h-[104px] sm:rounded-2xl sm:p-4 sm:shadow-[var(--shadow-card)]",
                STATE_STYLES[state],
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[17px] font-semibold leading-none sm:text-xl">{room.name}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">
                    #{room.number} · {t("upToGuests", { count: room.capacity })} ·{" "}
                    {mad(room.base_price)} {t("perGuests", { count: room.included_guests })}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-semibold sm:px-2.5 sm:py-1 sm:text-[11px]">
                  {stateLabel(state)}
                </span>
              </div>
              {stay ? (
                <p className="mt-2 truncate text-[13px] font-medium sm:mt-3 sm:text-sm">
                  {firstName(stay.guest?.full_name ?? "")} · {stay.num_guests} {t("pax")} ·{" "}
                  {shortDate(stay.check_in)}–{shortDate(stay.check_out)}
                </p>
              ) : (
                <p className="mt-2 text-[13px] text-muted-foreground sm:mt-3 sm:text-sm">
                  {t("available")}
                </p>
              )}
            </div>
          );
          return stay ? (
            <Link key={room.id} to="/stays/$id" params={{ id: stay.id }}>
              {content}
            </Link>
          ) : (
            <Link key={room.id} to="/stays/new" search={{ room: room.id }}>
              {content}
            </Link>
          );
        })}
      </div>

      <section className="mt-4 sm:mt-6">
        <h2 className="mb-2 text-xs sm:text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("today")}
        </h2>
        <div className="surface-card divide-y divide-border">
          <TodayGroup title={t("arrivals")} empty={arrivals.length === 0}>
            {arrivals.map((s) => (
              <Link
                key={s.id}
                to="/stays/$id"
                params={{ id: s.id }}
                className="flex items-center justify-between gap-2 px-3 py-2.5 text-[13px] active:bg-muted sm:px-4 sm:py-3 sm:text-sm"
              >
                <span className="font-medium">{s.guest?.full_name}</span>
                <span className="text-muted-foreground">{roomLabel(s.room)}</span>
              </Link>
            ))}
          </TodayGroup>
          <TodayGroup title={t("departures")} empty={departures.length === 0}>
            {departures.map((s) => (
              <Link
                key={s.id}
                to="/stays/$id"
                params={{ id: s.id }}
                className="flex items-center justify-between gap-2 px-3 py-2.5 text-[13px] active:bg-muted sm:px-4 sm:py-3 sm:text-sm"
              >
                <span className="font-medium">{s.guest?.full_name}</span>
                <span className="text-muted-foreground">{roomLabel(s.room)}</span>
              </Link>
            ))}
          </TodayGroup>
          <TodayGroup title={t("pendingRequests")} empty={pending.length === 0}>
            {pending.slice(0, 6).map((r) => (
              <Link
                key={r.id}
                to="/requests"
                className="flex items-center justify-between gap-2 px-3 py-2.5 text-[13px] active:bg-muted sm:px-4 sm:py-3 sm:text-sm"
              >
                <span className="font-medium">
                  {r.label}
                  {r.room ? ` · ${roomLabel(r.room)}` : ""}
                </span>
                <span className="text-muted-foreground">
                  {r.scheduled_at ? timeOnly(r.scheduled_at) : ""}
                </span>
              </Link>
            ))}
          </TodayGroup>
        </div>
      </section>
    </AppShell>
  );
}

function SummaryTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="surface-card flex min-h-[68px] flex-col items-center justify-center gap-0.5 px-1.5 py-2 sm:min-h-0 sm:gap-1 sm:px-2 sm:py-3">
      <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        {icon}
      </span>
      <span className="text-xl font-semibold leading-none sm:text-2xl">{value}</span>
      <span className="text-center text-[10px] leading-tight text-muted-foreground sm:text-[11px]">
        {label}
      </span>
    </div>
  );
}

function TodayGroup({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="px-3 pt-2.5 text-[11px] sm:px-4 sm:pt-3 sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {empty ? (
        <p className="px-3 py-2.5 text-[13px] text-muted-foreground sm:px-4 sm:py-3 sm:text-sm">
          {t("noResults")}
        </p>
      ) : (
        children
      )}
    </div>
  );
}
