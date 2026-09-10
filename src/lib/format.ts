/** Business timezone for the guesthouse. All "today"/day boundaries use it. */
export const BUSINESS_TZ = "Africa/Casablanca";

export function mad(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} MAD`;
}

/** Today's calendar date in Africa/Casablanca (YYYY-MM-DD). */
export function todayISO(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Offset of the business timezone, in minutes, at a given instant. */
function tzOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return (asUTC - instant.getTime()) / 60000;
}

/** UTC instants bounding a business day [start, end) in Africa/Casablanca. */
export function businessDayRange(iso: string): { fromISO: string; toISO: string } {
  const guess = Date.parse(`${iso}T00:00:00Z`);
  let start = guess - tzOffsetMinutes(new Date(guess)) * 60000;
  start = guess - tzOffsetMinutes(new Date(start)) * 60000;
  const end = start + 86400000;
  return { fromISO: new Date(start).toISOString(), toISO: new Date(end - 1).toISOString() };
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const dateOnly = iso.length <= 10;
  const d = new Date(dateOnly ? `${iso}T12:00:00Z` : iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    ...(dateOnly ? {} : { timeZone: BUSINESS_TZ }),
  });
}

export function shortDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: BUSINESS_TZ,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: BUSINESS_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function nights(checkIn: string, checkOut: string): number {
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  return Math.max(1, Math.round((b - a) / 86400000));
}

export function firstName(fullName: string): string {
  return fullName.split(" ")[0] ?? fullName;
}
