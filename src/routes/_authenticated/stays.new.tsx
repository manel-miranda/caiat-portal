import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { addDaysISO, mad, nights, todayISO } from "@/lib/format";
import { sourceOptions, t } from "@/lib/i18n";
import { roomsQuery, nightlyRate, suggestedAccommodationTotal } from "@/lib/queries";
import { createStay } from "@/lib/mutations";
import { useOnline } from "@/components/OfflineBanner";
import {
  countedStays,
  customersQuery,
  matchesCustomer,
  type CustomerRow,
} from "@/lib/customers";
import { shortDate } from "@/lib/format";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts a strict YYYY-MM-DD string that is also a real calendar date. */
function validDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return undefined;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10) === value ? value : undefined;
}

export const Route = createFileRoute("/_authenticated/stays/new")({
  head: () => ({ meta: [{ title: "New stay — Caiat Operations" }] }),
  validateSearch: (
    search: Record<string, unknown>,
  ): { room?: string; checkIn?: string; checkOut?: string } => {
    const out: { room?: string; checkIn?: string; checkOut?: string } = {};
    if (typeof search['room'] === "string") out.room = search['room'];
    const checkIn = validDate(search['checkIn']);
    if (checkIn) out.checkIn = checkIn;
    const checkOut = validDate(search['checkOut']);
    if (checkOut) out.checkOut = checkOut;
    return out;
  },
  component: NewStayPage,
});

function NewStayPage() {
  const search = Route.useSearch();
  const presetRoom = search.room;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const online = useOnline();
  const rooms = useQuery(roomsQuery);
  const customers = useQuery(customersQuery);

  // Calendar prefill: fall back to the normal defaults for missing/invalid values.
  const initialCheckIn = search.checkIn ?? todayISO();
  const initialCheckOut =
    search.checkOut && search.checkOut > initialCheckIn
      ? search.checkOut
      : addDaysISO(initialCheckIn, 1);

  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  // Picking an existing customer links the booking to that exact row; leaving it
  // empty creates a new customer. Same-name people are never merged.
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [roomId, setRoomId] = useState("");
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [numGuests, setNumGuests] = useState("2");
  const [source, setSource] = useState("walk_in");
  const [total, setTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [totalEdited, setTotalEdited] = useState(false);
  // Direct manual bookings stay confirmed by default; enquiries come in pending.
  const [confirmationStatus, setConfirmationStatus] = useState<"confirmed" | "pending">("confirmed");

  const selectedRoom = (rooms.data ?? []).find((r) => r.id === roomId);
  const guestCountNum = Number(numGuests);
  const stayNights = nights(checkIn, checkOut);
  const suggested =
    selectedRoom && Number.isFinite(guestCountNum) && guestCountNum >= 1
      ? suggestedAccommodationTotal(selectedRoom, guestCountNum, stayNights)
      : null;

  // Prefill the room only when the search param matches a real, active room.
  useEffect(() => {
    if (!presetRoom || roomId) return;
    if ((rooms.data ?? []).some((r) => r.id === presetRoom)) setRoomId(presetRoom);
  }, [presetRoom, rooms.data, roomId]);

  useEffect(() => {
    if (totalEdited) return;
    if (suggested === null || suggested <= 0) return;
    setTotal(String(suggested));
  }, [suggested, totalEdited]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!online) { toast.error(t("offline")); return; }
    if (!customer && !guestName.trim()) { toast.error(t("guestNameRequired")); return; }
    if (!roomId) { toast.error(t("roomRequired")); return; }
    if (!(checkOut > checkIn)) { toast.error(t("datesInvalid")); return; }
    const guestCount = Number(numGuests);
    if (!Number.isFinite(guestCount) || guestCount < 1) { toast.error(t("guestsMinOne")); return; }
    if (selectedRoom && guestCount > selectedRoom.capacity) {
      toast.error(`${t("guestsOverCapacity")} (${selectedRoom.name}: ${selectedRoom.capacity})`);
      return;
    }
    const amount = Number(total);
    if (!Number.isFinite(amount) || amount < 0) { toast.error(t("totalNonNegative")); return; }

    setBusy(true);
    try {
      const stayId = await createStay({
        guestName: customer ? customer.full_name : guestName,
        roomId,
        checkIn,
        checkOut,
        numGuests: guestCount,
        source,
        accommodationTotal: amount,
        notes,
        confirmationStatus,
        guestId: customer?.id ?? null,
        phone: customer ? null : guestPhone.trim() || null,
        email: customer ? null : guestEmail.trim() || null,
        userId: user?.id,
      });
      await queryClient.invalidateQueries();
      toast.success(confirmationStatus === "pending" ? t("reservationRequest") : t("stayCreated"));
      navigate({ to: "/stays/$id", params: { id: stayId } });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title={t("newStay")}>
      <form onSubmit={submit} className="surface-card space-y-4 p-4">
        <Field label={t("guestName")}>
          <Input
            className="tap-target text-base"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            required
          />
        </Field>

        <Field label={t("room")}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {(rooms.data ?? []).map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => setRoomId(r.id)}
                className={`rounded-xl border px-2 py-3 text-sm font-semibold ${
                  roomId === r.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card"
                }`}
              >
                {r.name}
                <span className="mt-0.5 block text-[10px] font-normal opacity-70">
                  #{r.number}
                </span>
              </button>
            ))}
          </div>
          {selectedRoom ? (
            <div className="mt-2 rounded-xl border border-border bg-muted/40 p-3 text-sm">
              <p className="font-semibold">{selectedRoom.name}</p>
              <p className="mt-1 text-muted-foreground">
                {t("upToGuests", { count: selectedRoom.capacity })} ·{" "}
                {mad(selectedRoom.base_price)}{" "}
                {t("perGuests", { count: selectedRoom.included_guests })}
                {selectedRoom.extra_guest_price > 0
                  ? ` · +${mad(selectedRoom.extra_guest_price)} ${t("perExtraGuest")}`
                  : ""}
              </p>
              {selectedRoom.breakfast_included ? (
                <p className="mt-1 text-muted-foreground">{t("breakfastIncluded")}</p>
              ) : null}
              {selectedRoom.amenities.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {selectedRoom.amenities.map((a) => (
                    <li
                      key={a}
                      className="rounded-full bg-background px-2.5 py-1 text-[11px] text-muted-foreground"
                    >
                      {a}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </Field>


        <div className="grid grid-cols-2 gap-3">
          <Field label={t("arrival")}>
            <Input
              type="date"
              className="tap-target text-base"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              required
            />
          </Field>
          <Field label={t("departure")}>
            <Input
              type="date"
              className="tap-target text-base"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              required
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("guests")}>
            <Input
              type="number"
              min={1}
              className="tap-target text-base"
              value={numGuests}
              onChange={(e) => setNumGuests(e.target.value)}
            />
          </Field>
          <Field label={t("accommodationTotal")}>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              className="tap-target text-base"
              value={total}
              onChange={(e) => {
                setTotalEdited(true);
                setTotal(e.target.value);
              }}
              required
            />
          </Field>
        </div>
        {selectedRoom && suggested !== null && stayNights > 0 ? (
          <p className="-mt-1 text-xs text-muted-foreground">
            {stayNights} × {mad(nightlyRate(selectedRoom, guestCountNum))} = {mad(suggested)} ·{" "}
            {t("editable")}
          </p>
        ) : null}


        <Field label={t("source")}>
          <div className="grid grid-cols-3 gap-2">
            {sourceOptions().map(({ key, label }) => (
              <button
                type="button"
                key={key}
                onClick={() => setSource(key)}
                className={`rounded-xl border px-2 py-3 text-xs font-semibold ${
                  source === key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        <Field label={t("bookingStatus")}>
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: "confirmed" as const, label: t("confirmedReservation") },
              { key: "pending" as const, label: t("pendingRequestOption") },
            ]).map(({ key, label }) => (
              <button
                type="button"
                key={key}
                onClick={() => setConfirmationStatus(key)}
                className={`rounded-xl border px-2 py-3 text-xs font-semibold ${
                  confirmationStatus === key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        <Field label={`${t("notes")} (${t("optional")})`}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </Field>

        <Button type="submit" disabled={busy} className="tap-target w-full rounded-xl text-base">
          {t("createStay")}
        </Button>
      </form>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}
