import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { addDaysISO, todayISO } from "@/lib/format";
import { sourceLabels, t } from "@/lib/i18n";
import { roomsQuery } from "@/lib/queries";
import { createStay } from "@/lib/mutations";
import { useOnline } from "@/components/OfflineBanner";

export const Route = createFileRoute("/_authenticated/stays/new")({
  head: () => ({ meta: [{ title: "New stay — Caiat Operations" }] }),
  validateSearch: (search: Record<string, unknown>): { room?: string } =>
    typeof search['room'] === "string" ? { room: search['room'] } : {},
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

  const [guestName, setGuestName] = useState("");
  const [roomId, setRoomId] = useState(presetRoom ?? "");
  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState(addDaysISO(todayISO(), 1));
  const [numGuests, setNumGuests] = useState("2");
  const [source, setSource] = useState("walk_in");
  const [total, setTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!online) { toast.error(t("offline")); return; }
    if (!guestName.trim()) { toast.error(t("guestNameRequired")); return; }
    if (!roomId) { toast.error(t("roomRequired")); return; }
    if (!(checkOut > checkIn)) { toast.error(t("datesInvalid")); return; }
    const guestCount = Number(numGuests);
    if (!Number.isFinite(guestCount) || guestCount < 1) { toast.error(t("guestsMinOne")); return; }
    const amount = Number(total);
    if (!Number.isFinite(amount) || amount < 0) { toast.error(t("totalNonNegative")); return; }

    setBusy(true);
    try {
      const stayId = await createStay({
        guestName,
        roomId,
        checkIn,
        checkOut,
        numGuests: guestCount,
        source,
        accommodationTotal: amount,
        notes,
        userId: user?.id,
      });
      await queryClient.invalidateQueries();
      toast.success(t("createStay"));
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
          <div className="grid grid-cols-4 gap-2">
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
                {r.number}
              </button>
            ))}
          </div>
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
              onChange={(e) => setTotal(e.target.value)}
              required
            />
          </Field>
        </div>

        <Field label={t("source")}>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(sourceLabels).map(([key, label]) => (
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
