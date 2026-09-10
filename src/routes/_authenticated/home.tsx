import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, LogIn, LogOut, Bell } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { activeStaysQuery, requestsQuery, roomsQuery, stayForRoom, roomState } from "@/lib/queries";
import { firstName, mad, shortDate, todayISO, timeOnly } from "@/lib/format";
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

const STATE_LABELS: Record<string, string> = {
  available: t("available"),
  occupied: t("occupied"),
  arrival_today: t("arrivalToday"),
  departure_today: t("departureToday"),
};

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
      <section className="grid grid-cols-3 gap-3">
        <SummaryTile icon={<LogIn className="size-4" />} label={t("arrivals")} value={arrivals.length} />
        <SummaryTile icon={<LogOut className="size-4" />} label={t("departures")} value={departures.length} />
        <Link to="/requests" className="contents">
          <SummaryTile icon={<Bell className="size-4" />} label={t("pendingRequests")} value={pending.length} />
        </Link>
      </section>

      <div className="mt-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("navRooms")}
        </h2>
        <Link
          to="/stays/new"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground active:scale-[0.98]"
        >
          <Plus className="size-4" /> {t("newStay")}
        </Link>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {(rooms.data ?? []).map((room) => {
          const stay = stayForRoom(allStays, room.id, today);
          const state = roomState(stay, today);
          const content = (
            <div
              className={cn(
                "flex min-h-[104px] w-full flex-col justify-between rounded-2xl border p-4 text-left shadow-[var(--shadow-card)] transition-transform active:scale-[0.99]",
                STATE_STYLES[state],
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xl font-semibold leading-none">{room.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("room")} {room.number} · Up to {room.capacity} ·{" "}
                    {mad(room.base_price)} / {room.included_guests} guests
                  </p>
                </div>
                <span className="rounded-full bg-background/70 px-2.5 py-1 text-[11px] font-semibold">
                  {STATE_LABELS[state]}
                </span>
              </div>
              {stay ? (
                <p className="mt-3 truncate text-sm font-medium">
                  {firstName(stay.guest?.full_name ?? "")} · {stay.num_guests} pax ·{" "}
                  {shortDate(stay.check_in)}–{shortDate(stay.check_out)}
                </p>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">{t("available")}</p>
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

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("today")}
        </h2>
        <div className="surface-card divide-y divide-border">
          <TodayGroup title={t("arrivals")} empty={arrivals.length === 0}>
            {arrivals.map((s) => (
              <Link
                key={s.id}
                to="/stays/$id"
                params={{ id: s.id }}
                className="flex items-center justify-between px-4 py-3 text-sm active:bg-muted"
              >
                <span className="font-medium">{s.guest?.full_name}</span>
                <span className="text-muted-foreground">
                  {t("room")} {s.room?.number}
                </span>
              </Link>
            ))}
          </TodayGroup>
          <TodayGroup title={t("departures")} empty={departures.length === 0}>
            {departures.map((s) => (
              <Link
                key={s.id}
                to="/stays/$id"
                params={{ id: s.id }}
                className="flex items-center justify-between px-4 py-3 text-sm active:bg-muted"
              >
                <span className="font-medium">{s.guest?.full_name}</span>
                <span className="text-muted-foreground">
                  {t("room")} {s.room?.number}
                </span>
              </Link>
            ))}
          </TodayGroup>
          <TodayGroup title={t("pendingRequests")} empty={pending.length === 0}>
            {pending.slice(0, 6).map((r) => (
              <Link
                key={r.id}
                to="/requests"
                className="flex items-center justify-between px-4 py-3 text-sm active:bg-muted"
              >
                <span className="font-medium">
                  {r.label}
                  {r.room ? ` · ${t("room")} ${r.room.number}` : ""}
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
    <div className="surface-card flex flex-col items-center justify-center gap-1 px-2 py-3">
      <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        {icon}
      </span>
      <span className="text-2xl font-semibold leading-none">{value}</span>
      <span className="text-center text-[11px] text-muted-foreground">{label}</span>
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
      <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {empty ? <p className="px-4 py-3 text-sm text-muted-foreground">{t("noResults")}</p> : children}
    </div>
  );
}
