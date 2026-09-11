import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, LogIn, LogOut, BedDouble, Clock, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { staysRangeQuery, roomsQuery, type StayRow } from "@/lib/queries";
import { addDaysISO, firstName, roomLabel, shortDate, todayISO } from "@/lib/format";
import { sourceLabel, t, useLang, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Reservations calendar — Caiat Operations" },
      {
        name: "description",
        content:
          "Month view of Caiat guesthouse room occupancy, arrivals, departures and pending reservation requests.",
      },
      { property: "og:title", content: "Reservations calendar — Caiat Operations" },
      {
        property: "og:description",
        content:
          "See which Caiat rooms are booked each night and open any stay directly from the calendar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalendarPage,
});

const INTL_LOCALE: Record<Lang, string> = {
  pt: "pt-PT",
  en: "en-GB",
  fr: "fr-FR",
  ar: "ar-MA",
};

/** ISO day-of-month helpers on plain YYYY-MM-DD strings (no device timezone). */
function monthStart(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

/** Monday-first weekday index (0 = Monday) of a calendar date. */
function weekdayIndex(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** Full weeks covering a month, so leading/trailing days keep the grid square. */
function monthGrid(year: number, month: number): string[] {
  const first = monthStart(year, month);
  const start = addDaysISO(first, -weekdayIndex(first));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Math.ceil((weekdayIndex(first) + daysInMonth) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => addDaysISO(start, i));
}

function isConfirmed(s: StayRow) {
  return s.confirmation_status === "confirmed";
}
/** Occupancy is [check_in, check_out): the checkout night is already free. */
function occupies(s: StayRow, iso: string) {
  return s.check_in <= iso && s.check_out > iso;
}

function CalendarPage() {
  const { lang } = useLang();
  const today = todayISO();
  const [cursor, setCursor] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)) - 1,
  }));
  const [selected, setSelected] = useState(today);
  const [roomFilter, setRoomFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const rooms = useQuery(roomsQuery);
  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const rangeFrom = grid[0]!;
  const rangeTo = grid[grid.length - 1]!;
  const stays = useQuery(staysRangeQuery(rangeFrom, rangeTo));

  const monthLabel = new Intl.DateTimeFormat(INTL_LOCALE[lang], {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${monthStart(cursor.year, cursor.month)}T00:00:00Z`));

  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(INTL_LOCALE[lang], { weekday: "short", timeZone: "UTC" });
    // 2024-01-01 was a Monday, so this walks Monday → Sunday.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(`2024-01-0${i + 1}T00:00:00Z`)));
  }, [lang]);

  const visible = (stays.data ?? []).filter(
    (s) => roomFilter === "all" || s.room_id === roomFilter,
  );

  function goMonth(delta: number) {
    const next = new Date(Date.UTC(cursor.year, cursor.month + delta, 1));
    const year = next.getUTCFullYear();
    const month = next.getUTCMonth();
    setCursor({ year, month });
    setExpanded(null);
    // Keep today selected while browsing the current month, else the 1st.
    const isCurrent = year === Number(today.slice(0, 4)) && month === Number(today.slice(5, 7)) - 1;
    setSelected(isCurrent ? today : monthStart(year, month));
  }

  function goToday() {
    setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 });
    setSelected(today);
    setExpanded(null);
  }

  const dayArrivals = visible.filter((s) => isConfirmed(s) && s.check_in === selected);
  const dayInHouse = visible.filter(
    (s) => isConfirmed(s) && occupies(s, selected) && s.check_in !== selected,
  );
  const dayDepartures = visible.filter((s) => isConfirmed(s) && s.check_out === selected);
  const dayPending = visible.filter(
    (s) => !isConfirmed(s) && (occupies(s, selected) || s.check_out === selected),
  );
  const agendaEmpty =
    dayArrivals.length + dayInHouse.length + dayDepartures.length + dayPending.length === 0;

  const newStaySearch = (iso: string) => ({
    checkIn: iso,
    checkOut: addDaysISO(iso, 1),
    ...(roomFilter !== "all" ? { room: roomFilter } : {}),
  });

  return (
    <AppShell title={t("calendarTitle")}>
      <div className="mb-3">
        <Link
          to="/stays/new"
          search={newStaySearch(selected)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground active:scale-[0.98]"
        >
          <Plus className="size-4" /> {t("addReservation")}
        </Link>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => goMonth(-1)}
          aria-label={t("prevMonth")}
          className="flex size-11 items-center justify-center rounded-full border border-border bg-card active:bg-muted"
        >
          <ChevronLeft className="size-5 rtl:rotate-180" />
        </button>
        <div className="min-w-0 text-center">
          <p className="truncate text-base font-semibold capitalize">{monthLabel}</p>
          <button
            onClick={goToday}
            className="mt-0.5 text-xs font-medium text-primary underline-offset-2 active:underline"
          >
            {t("today")}
          </button>
        </div>
        <button
          onClick={() => goMonth(1)}
          aria-label={t("nextMonth")}
          className="flex size-11 items-center justify-center rounded-full border border-border bg-card active:bg-muted"
        >
          <ChevronRight className="size-5 rtl:rotate-180" />
        </button>
      </div>

      <div className="mt-3">
        <label htmlFor="room-filter" className="sr-only">
          {t("filterRoom")}
        </label>
        <select
          id="room-filter"
          value={roomFilter}
          onChange={(e) => setRoomFilter(e.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
        >
          <option value="all">{t("allRooms")}</option>
          {(rooms.data ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {roomLabel(r)} · #{r.number}
            </option>
          ))}
        </select>
      </div>

      <div className="surface-card mt-3 p-2">
        <div className="grid grid-cols-7 gap-1 pb-1">
          {weekdays.map((w) => (
            <div
              key={w}
              className="text-center text-[10px] font-semibold uppercase text-muted-foreground"
            >
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((iso) => {
            const inMonth = Number(iso.slice(5, 7)) - 1 === cursor.month;
            const items = visible
              .filter((s) => occupies(s, iso))
              .sort((a, b) => Number(isConfirmed(b)) - Number(isConfirmed(a)));
            const isExpanded = expanded === iso;
            const shown = isExpanded ? items : items.slice(0, 2);
            return (
              <div
                key={iso}
                className={cn(
                  "min-h-[68px] rounded-lg border p-1 text-left",
                  inMonth ? "border-border bg-background" : "border-transparent bg-muted/40",
                  selected === iso && "ring-2 ring-primary",
                )}
              >
                <button
                  onClick={() => setSelected(iso)}
                  className="flex w-full items-center justify-between"
                >
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full text-[11px] font-semibold",
                      iso === today
                        ? "bg-primary text-primary-foreground"
                        : inMonth
                          ? "text-foreground"
                          : "text-muted-foreground",
                    )}
                  >
                    {Number(iso.slice(8, 10))}
                  </span>
                </button>
                <div className="mt-0.5 space-y-0.5">
                  {shown.map((s) => (
                    <Link
                      key={s.id}
                      to="/stays/$id"
                      params={{ id: s.id }}
                      title={`${s.guest?.full_name ?? ""} · ${roomLabel(s.room)}`}
                      className={cn(
                        "block truncate rounded px-1 py-[1px] text-[9px] leading-tight",
                        isConfirmed(s)
                          ? "border border-primary/40 bg-primary/15 font-semibold text-foreground"
                          : "border border-dashed border-warning bg-warning/10 italic text-foreground",
                      )}
                    >
                      {isConfirmed(s) ? "" : "◇ "}
                      {roomFilter === "all"
                        ? roomLabel(s.room)
                        : firstName(s.guest?.full_name ?? "—")}
                    </Link>
                  ))}
                  {items.length > 2 && !isExpanded ? (
                    <button
                      onClick={() => {
                        setExpanded(iso);
                        setSelected(iso);
                      }}
                      className="w-full truncate rounded px-1 text-[9px] font-medium text-muted-foreground underline"
                    >
                      {t("moreItems", { count: items.length - 2 })}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="font-semibold uppercase tracking-wide">{t("legend")}:</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded border border-primary/40 bg-primary/15" />
          {t("confirmedLabel")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded border border-dashed border-warning bg-warning/10" />
          ◇ {t("pending")}
        </span>
      </div>

      <section className="mt-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {shortDate(selected)}
          </h2>
          <Link
            to="/stays/new"
            search={newStaySearch(selected)}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold active:bg-primary/20"
          >
            <Plus className="size-3.5" />
            {t("addReservationOn", { date: shortDate(selected) })}
          </Link>
        </div>

        {stays.isLoading ? (
          <p className="surface-card px-4 py-6 text-center text-sm text-muted-foreground">…</p>
        ) : stays.isError ? (
          <p className="surface-card px-4 py-6 text-center text-sm text-destructive">
            {(stays.error as Error).message}
          </p>
        ) : agendaEmpty ? (
          <p className="surface-card px-4 py-6 text-center text-sm text-muted-foreground">
            {t("noReservationsDay")}
          </p>
        ) : (
          <div className="space-y-3">
            <AgendaGroup
              icon={<LogIn className="size-4" />}
              title={t("arrivals")}
              stays={dayArrivals}
            />
            <AgendaGroup
              icon={<BedDouble className="size-4" />}
              title={t("inHouse")}
              stays={dayInHouse}
            />
            <AgendaGroup
              icon={<LogOut className="size-4" />}
              title={t("departures")}
              stays={dayDepartures}
            />
            <AgendaGroup
              icon={<Clock className="size-4" />}
              title={t("pendingReservations")}
              stays={dayPending}
              pending
            />
          </div>
        )}
      </section>
    </AppShell>
  );
}

function AgendaGroup({
  icon,
  title,
  stays,
  pending,
}: {
  icon: React.ReactNode;
  title: string;
  stays: StayRow[];
  pending?: boolean;
}) {
  if (stays.length === 0) return null;
  return (
    <div className="surface-card overflow-hidden">
      <p className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title} · {stays.length}
      </p>
      <div className="divide-y divide-border">
        {stays.map((s) => (
          <Link
            key={s.id}
            to="/stays/$id"
            params={{ id: s.id }}
            className="flex items-center justify-between gap-3 px-4 py-3 text-sm active:bg-muted"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">
                {pending ? "◇ " : ""}
                {s.guest?.full_name ?? "—"}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {roomLabel(s.room)} · {shortDate(s.check_in)}–{shortDate(s.check_out)} ·{" "}
                {sourceLabel(s.source)}
              </span>
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold",
                pending
                  ? "border border-dashed border-warning bg-warning/10"
                  : "border border-primary/40 bg-primary/15",
              )}
            >
              {pending ? t("pending") : t("confirmedLabel")}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
