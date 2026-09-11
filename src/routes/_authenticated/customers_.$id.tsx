import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  countedStays,
  customersQuery,
  findDuplicateCandidates,
  matchReasonKey,
  mergeCustomers,
  customerFinancialsQuery,
  customerQuery,
  isReturning,
  updateCustomer,
} from "@/lib/customers";
import { roomsQuery } from "@/lib/queries";
import { mad, roomLabel, shortDate } from "@/lib/format";
import { statusLabel, t } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/customers_/$id")({
  head: () => ({
    meta: [
      { title: "Customer profile — Caiat Operations" },
      { name: "description", content: "Stay history and internal notes for a Caiat customer." },
    ],
  }),
  component: CustomerDetailPage,
});

function CustomerDetailPage() {
  const { id } = Route.useParams();
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const customer = useQuery(customerQuery(id));
  const allCustomers = useQuery(customersQuery);
  const money = useQuery(customerFinancialsQuery(id));
  const rooms = useQuery(roomsQuery);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    nationality: "",
    notes: "",
  });

  const c = customer.data;
  const stays = c ? countedStays(c) : [];
  const sorted = [...(c?.stays ?? [])].sort((a, b) => b.check_in.localeCompare(a.check_in));
  const roomName = (roomId: string) => {
    const room = (rooms.data ?? []).find((r) => r.id === roomId);
    return room ? roomLabel(room) : "—";
  };

  function startEdit() {
    if (!c) return;
    setForm({
      full_name: c.full_name,
      phone: c.phone ?? "",
      email: c.email ?? "",
      nationality: c.nationality ?? "",
      notes: c.notes ?? "",
    });
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    try {
      await updateCustomer({
        id,
        fullName: form.full_name,
        phone: form.phone,
        email: form.email,
        nationality: form.nationality,
        notes: form.notes,
        userId: user?.id,
      });
      await queryClient.invalidateQueries();
      toast.success(t("customerSaved"));
      setEditing(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Candidates are matched against the live values being edited, if any. */
  const duplicates = useMemo(() => {
    if (!c) return [];
    return findDuplicateCandidates(allCustomers.data ?? [], {
      id: c.id,
      full_name: editing ? form.full_name : c.full_name,
      phone: editing ? form.phone : c.phone,
      email: editing ? form.email : c.email,
    });
  }, [allCustomers.data, c, editing, form]);

  const mergeTarget = duplicates.find((d) => d.customer.id === mergeTargetId)?.customer ?? null;
  /** Default keeps the older record, but the user can flip which one remains. */
  const [keepThis, setKeepThis] = useState(true);

  async function confirmMerge() {
    if (!c || !mergeTarget) return;
    const keepId = keepThis ? c.id : mergeTarget.id;
    const dropId = keepThis ? mergeTarget.id : c.id;
    setMerging(true);
    try {
      await mergeCustomers(keepId, dropId);
      await queryClient.invalidateQueries();
      toast.success(t("customersMerged"));
      setMergeTargetId(null);
      navigate({ to: "/customers/$id", params: { id: keepId }, replace: true });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setMerging(false);
    }
  }

  if (customer.isLoading) {
    return (
      <AppShell title={t("customerProfile")}>
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      </AppShell>
    );
  }
  if (customer.error || !c) {
    return (
      <AppShell title={t("customerProfile")}>
        <p className="text-sm text-destructive">
          {(customer.error as Error | null)?.message ?? t("noCustomers")}
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell title={c.full_name}>
      <section className="surface-card p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold sm:text-2xl">{c.full_name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {[c.phone, c.email, c.nationality].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <span
            className={
              isReturning(c)
                ? "shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
                : "shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground"
            }
          >
            {isReturning(c) ? t("returningCustomer") : t("newCustomer")}
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Info label={t("totalStays")} value={String(stays.length)} />
          <Info
            label={t("lastStay")}
            value={sorted[0] ? shortDate(sorted[0].check_in) : t("noStaysYet")}
          />
          <Info
            label={t("firstStay")}
            value={sorted.length ? shortDate(sorted[sorted.length - 1]!.check_in) : "—"}
          />
          <Info label={t("totalPaid")} value={money.data ? mad(money.data.paid) : "—"} />
          <Info
            label={t("totalBilled")}
            value={
              money.data
                ? mad(
                    money.data.charges +
                      sorted.reduce((s, x) => s + Number(x.accommodation_total ?? 0), 0),
                  )
                : "—"
            }
          />
        </dl>

        {can("customers_manage") && !editing ? (
          <Button className="tap-target mt-4 w-full" variant="outline" onClick={startEdit}>
            {t("editCustomer")}
          </Button>
        ) : null}
      </section>

      {editing ? (
        <section className="surface-card mt-4 space-y-3 p-3 sm:p-4">
          <Field label={t("guestName")}>
            <Input
              className="tap-target text-base"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </Field>
          <Field label={t("phone")}>
            <Input
              className="tap-target text-base"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label={t("email")}>
            <Input
              className="tap-target text-base"
              inputMode="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label={t("nationality")}>
            <Input
              className="tap-target text-base"
              value={form.nationality}
              onChange={(e) => setForm({ ...form, nationality: e.target.value })}
            />
          </Field>
          <Field label={t("customerNotes")}>
            <Textarea
              className="text-base"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <p className="text-xs text-muted-foreground">{t("customerNotesHint")}</p>
          <div className="flex gap-2">
            <Button className="tap-target flex-1" onClick={save} disabled={busy}>
              {t("save")}
            </Button>
            <Button
              className="tap-target flex-1"
              variant="outline"
              onClick={() => setEditing(false)}
              disabled={busy}
            >
              {t("cancel")}
            </Button>
          </div>
        </section>
      ) : c.notes ? (
        <section className="surface-card mt-4 p-3 sm:p-4">
          <h2 className="text-sm font-semibold">{t("customerNotes")}</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{c.notes}</p>
        </section>
      ) : null}

      {can("customers_manage") && duplicates.length > 0 ? (
        <section className="surface-card mt-3 p-3 sm:mt-4 sm:p-3 sm:p-4">
          <h2 className="text-sm font-semibold">{t("possibleDuplicates")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("possibleDuplicatesHint")}</p>
          <ul className="mt-2 space-y-1.5">
            {duplicates.map(({ customer: d, reason }) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{d.full_name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {t(matchReasonKey(reason))}
                    {d.phone || d.email ? ` · ${d.phone ?? d.email}` : ""} ·{" "}
                    {t("stayCount", { count: countedStays(d).length })}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    // Default to keeping the older record.
                    setKeepThis(c.created_at <= d.created_at);
                    setMergeTargetId(d.id);
                  }}
                  className="min-h-11 shrink-0 rounded-full border border-border bg-card px-3 text-xs font-semibold"
                >
                  {t("mergeCustomers")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Dialog open={!!mergeTarget} onOpenChange={(o) => !o && setMergeTargetId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("mergeConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("mergeConfirmBody")}</DialogDescription>
          </DialogHeader>
          {mergeTarget ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">{t("recordToKeep")}</p>
              {[
                { keep: true, row: c },
                { keep: false, row: mergeTarget },
              ].map(({ keep, row }) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setKeepThis(keep)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-start ${
                    keepThis === keep ? "border-primary bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{row.full_name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {[row.phone, row.email].filter(Boolean).join(" · ") || "—"} ·{" "}
                      {t("stayCount", { count: countedStays(row).length })} ·{" "}
                      {shortDate(row.created_at.slice(0, 10))}
                    </span>
                  </span>
                  {row.created_at <= (keep ? mergeTarget.created_at : c.created_at) ? (
                    <span className="shrink-0 text-[10px] font-semibold uppercase text-muted-foreground">
                      {t("oldestRecord")}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="tap-target"
              onClick={() => setMergeTargetId(null)}
              disabled={merging}
            >
              {t("cancel")}
            </Button>
            <Button className="tap-target" onClick={confirmMerge} disabled={merging}>
              {t("mergeCustomers")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      <section className="mt-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("stayHistory")}
        </h2>
        <ul className="mt-2 space-y-2">
          {sorted.map((s) => (
            <li key={s.id}>
              <Link
                to="/stays/$id"
                params={{ id: s.id }}
                className="surface-card flex items-center justify-between gap-3 p-3 text-sm active:bg-muted"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{roomName(s.room_id)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {shortDate(s.check_in)} → {shortDate(s.check_out)}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {s.confirmation_status === "pending"
                    ? t("pendingRequestOption")
                    : statusLabel(s.status)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {sorted.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("noStaysYet")}</p>
        ) : null}
      </section>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
