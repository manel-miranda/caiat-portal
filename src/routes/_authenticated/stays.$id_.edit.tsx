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
import { useOnline } from "@/components/OfflineBanner";
import { requirePermission } from "@/lib/admin-guard";
import { mad, nights } from "@/lib/format";
import { sourceOptions, t } from "@/lib/i18n";
import { nightlyRate, roomsQuery, stayQuery, suggestedAccommodationTotal } from "@/lib/queries";
import { updateStay, type EditableStayFields } from "@/lib/mutations";

export const Route = createFileRoute("/_authenticated/stays/$id_/edit")({
  beforeLoad: requirePermission("reservations_manage"),
  head: () => ({ meta: [{ title: "Edit stay — Caiat Operations" }] }),
  component: EditStayPage,
});

function EditStayPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const online = useOnline();
  const rooms = useQuery(roomsQuery);
  const stayQ = useQuery(stayQuery(id));
  const stay = stayQ.data;

  const [form, setForm] = useState<EditableStayFields | null>(null);
  const [busy, setBusy] = useState(false);

  if (stayQ.isPending) {
    return (
      <AppShell title={t("editStay")}>
        <p className="surface-card p-3 sm:p-4 text-sm text-muted-foreground">{t("loading")}</p>
      </AppShell>
    );
  }

  if (stayQ.isError || !stay) {
    return (
      <AppShell title={t("editStay")}>
        <div className="surface-card space-y-3 p-3 sm:p-4">
          <p className="text-sm text-destructive">
            {stayQ.error ? (stayQ.error as Error).message : t("stayNotFound")}
          </p>
          <Button
            variant="outline"
            className="tap-target rounded-xl"
            onClick={() => navigate({ to: "/home" })}
          >
            {t("back")}
          </Button>
        </div>
      </AppShell>
    );
  }

  const before: EditableStayFields = {
    guestName: stay.guest?.full_name ?? "",
    roomId: stay.room_id,
    checkIn: stay.check_in,
    checkOut: stay.check_out,
    numGuests: stay.num_guests,
    source: stay.source,
    accommodationTotal: Number(stay.accommodation_total),
    notes: stay.notes ?? "",
  };
  const values = form ?? before;
  const editable = stay.status === "active" && stay.confirmation_status !== "rejected";

  if (!editable) {
    return (
      <AppShell title={t("editStay")}>
        <div className="surface-card space-y-3 p-3 sm:p-4">
          <p className="text-sm text-muted-foreground">{t("stayNotEditable")}</p>
          <Button
            variant="outline"
            className="tap-target rounded-xl"
            onClick={() => navigate({ to: "/stays/$id", params: { id } })}
          >
            {t("back")}
          </Button>
        </div>
      </AppShell>
    );
  }

  function set<K extends keyof EditableStayFields>(key: K, value: EditableStayFields[K]) {
    setForm({ ...values, [key]: value });
  }

  const selectedRoom = (rooms.data ?? []).find((r) => r.id === values.roomId);
  const stayNights = nights(values.checkIn, values.checkOut);
  // Suggested only: an amount the owner typed by hand is never overwritten.
  const suggested =
    selectedRoom && values.numGuests >= 1 && stayNights > 0
      ? suggestedAccommodationTotal(selectedRoom, values.numGuests, stayNights)
      : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!online) {
      toast.error(t("offline"));
      return;
    }
    if (!values.guestName.trim()) {
      toast.error(t("guestNameRequired"));
      return;
    }
    if (!values.roomId) {
      toast.error(t("roomRequired"));
      return;
    }
    if (!(values.checkOut > values.checkIn)) {
      toast.error(t("datesInvalid"));
      return;
    }
    if (!Number.isFinite(values.numGuests) || values.numGuests < 1) {
      toast.error(t("guestsMinOne"));
      return;
    }
    if (selectedRoom && values.numGuests > selectedRoom.capacity) {
      toast.error(`${t("guestsOverCapacity")} (${selectedRoom.name}: ${selectedRoom.capacity})`);
      return;
    }
    if (!Number.isFinite(values.accommodationTotal) || values.accommodationTotal < 0) {
      toast.error(t("totalNonNegative"));
      return;
    }

    setBusy(true);
    try {
      await updateStay({ stayId: id, next: values, before, userId: user?.id });
      await queryClient.invalidateQueries();
      toast.success(t("stayUpdated"));
      navigate({ to: "/stays/$id", params: { id } });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title={t("editStay")}>
      <form onSubmit={submit} className="surface-card space-y-3 p-3 sm:space-y-4 sm:p-4">
        <Field label={t("guestName")}>
          <Input
            className="tap-target text-base"
            value={values.guestName}
            onChange={(e) => set("guestName", e.target.value)}
            required
          />
        </Field>

        <Field label={t("room")}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {(rooms.data ?? []).map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => set("roomId", r.id)}
                className={`rounded-xl border px-2 py-3 text-sm font-semibold ${
                  values.roomId === r.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card"
                }`}
              >
                {r.name}
                <span className="mt-0.5 block text-[10px] font-normal opacity-70">#{r.number}</span>
              </button>
            ))}
          </div>
          {selectedRoom ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("upToGuests", { count: selectedRoom.capacity })} ·{" "}
              {mad(nightlyRate(selectedRoom, values.numGuests))}
            </p>
          ) : null}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("arrival")}>
            <Input
              type="date"
              className="tap-target text-base"
              value={values.checkIn}
              onChange={(e) => set("checkIn", e.target.value)}
              required
            />
          </Field>
          <Field label={t("departure")}>
            <Input
              type="date"
              className="tap-target text-base"
              value={values.checkOut}
              onChange={(e) => set("checkOut", e.target.value)}
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
              value={String(values.numGuests)}
              onChange={(e) => set("numGuests", Number(e.target.value))}
            />
          </Field>
          <Field label={t("accommodationTotal")}>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              className="tap-target text-base"
              value={String(values.accommodationTotal)}
              onChange={(e) => set("accommodationTotal", Number(e.target.value))}
              required
            />
          </Field>
        </div>
        {suggested !== null && suggested !== values.accommodationTotal ? (
          <div className="-mt-1 flex items-center justify-between gap-3 rounded-xl bg-muted/60 p-3 text-xs">
            <span>
              {t("suggestedTotal")}: {mad(suggested)} ({stayNights} ×{" "}
              {mad(nightlyRate(selectedRoom!, values.numGuests))})
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-lg"
              onClick={() => set("accommodationTotal", suggested)}
            >
              {t("useSuggested")}
            </Button>
          </div>
        ) : null}

        <Field label={t("source")}>
          <div className="grid grid-cols-3 gap-2">
            {sourceOptions().map(({ key, label }) => (
              <button
                type="button"
                key={key}
                onClick={() => set("source", key)}
                className={`rounded-xl border px-2 py-3 text-xs font-semibold ${
                  values.source === key
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
          <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
        </Field>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="tap-target flex-1 rounded-xl"
            onClick={() => navigate({ to: "/stays/$id", params: { id } })}
          >
            {t("cancel")}
          </Button>
          <Button type="submit" disabled={busy} className="tap-target flex-1 rounded-xl text-base">
            {t("saveChanges")}
          </Button>
        </div>
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
