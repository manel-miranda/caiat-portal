import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { useOnline } from "@/components/OfflineBanner";
import { requireAdmin } from "@/lib/admin-guard";
import { saveCashCount } from "@/lib/mutations";
import { mad, shortDateTime, todayISO } from "@/lib/format";
import { t } from "@/lib/i18n";
import { cashDayQuery, profilesQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/cash")({
  beforeLoad: requireAdmin,
  head: () => ({ meta: [{ title: "Cash control — Caiat Operations" }] }),
  component: CashPage,
});

function CashPage() {
  const { user } = useAuth();
  const online = useOnline();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const day = useQuery(cashDayQuery(date));
  const profiles = useQuery(profilesQuery);

  const reconciliation = day.data?.reconciliation ?? null;
  const payments = day.data?.payments ?? [];
  const expected = payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  // Reload the saved count whenever the selected day changes.
  useEffect(() => {
    setCounted(reconciliation ? String(reconciliation.counted_total) : "");
    setNotes(reconciliation?.notes ?? "");
  }, [reconciliation?.id, date]);

  const countedNumber = Number(counted.trim().replace(",", "."));
  const countValid = counted.trim() !== "" && Number.isFinite(countedNumber) && countedNumber >= 0;
  const difference = countedNumber - expected;
  const hasCount = countValid;

  const byEmployee = Object.values(
    payments.reduce<Record<string, { id: string; total: number; count: number }>>((acc, p) => {
      const key = p.received_by ?? "unknown";
      const entry = acc[key] ?? { id: key, total: 0, count: 0 };
      entry.total += Number(p.amount ?? 0);
      entry.count += 1;
      acc[key] = entry;
      return acc;
    }, {}),
  ).sort((a, b) => b.total - a.total);

  function employeeName(id: string) {
    return (profiles.data ?? []).find((p) => p.id === id)?.full_name ?? "—";
  }

  async function save() {
    if (!online) { toast.error(t("offline")); return; }
    if (!user?.id) return;
    setBusy(true);
    try {
      await saveCashCount({
        date,
        expectedTotal: expected,
        countedTotal: countedNumber,
        notes,
        existingId: reconciliation?.id ?? null,
        userId: user.id,
      });
      await queryClient.invalidateQueries();
      toast.success(t("cashCountSaved"));
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <AppShell title={t("cashControl")}>
      <div className="surface-card p-4">
        <Label htmlFor="cash-date">{t("date")}</Label>
        <Input
          id="cash-date"
          type="date"
          value={date}
          max={todayISO()}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 h-12"
        />
      </div>

      {day.isError ? (
        <p className="surface-card mt-3 p-4 text-sm text-destructive">{(day.error as Error).message}</p>
      ) : day.isLoading ? (
        <p className="surface-card mt-3 p-4 text-sm text-muted-foreground">{t("loading")}</p>
      ) : (
        <>
          <section className="mt-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("byEmployee")}
            </h2>
            <div className="surface-card divide-y divide-border">
              {byEmployee.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">{t("noResults")}</p>
              ) : (
                byEmployee.map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="truncate font-medium">{employeeName(e.id)}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {e.count} × · <span className="font-semibold text-foreground">{mad(e.total)}</span>
                    </span>
                  </div>
                ))
              )}
              <div className="flex items-center justify-between bg-muted/40 px-4 py-3 text-sm font-semibold">
                <span>{t("expectedInSafe")}</span>
                <span>{mad(expected)}</span>
              </div>
            </div>
          </section>

          <section className="surface-card mt-4 space-y-3 p-4">
            <div>
              <Label htmlFor="counted">{t("countedCash")}</Label>
              <Input
                id="counted"
                inputMode="decimal"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                placeholder="0"
                className="mt-1 h-12 text-lg"
              />
            </div>

            <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-3 text-sm">
              <span className="font-medium">{t("difference")}</span>
              <span className="text-lg font-semibold">{hasCount ? mad(difference) : "—"}</span>
            </div>

            {hasCount ? (
              difference === 0 ? (
                <p className="flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2.5 text-sm font-medium text-success">
                  <CheckCircle2 className="size-4" /> {t("balanced")}
                </p>
              ) : (
                <p className="flex items-center gap-2 rounded-xl bg-warning/20 px-3 py-2.5 text-sm font-medium text-warning-foreground">
                  <AlertTriangle className="size-4" /> {t("discrepancy")}
                </p>
              )
            ) : null}

            <div>
              <Label htmlFor="cash-notes">
                {t("notes")} <span className="text-muted-foreground">({t("optional")})</span>
              </Label>
              <Textarea
                id="cash-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>

            <Button className="h-12 w-full text-base" disabled={!hasCount || busy} onClick={save}>
              {t("saveCount")}
            </Button>

            {reconciliation ? (
              <p className="text-center text-xs text-muted-foreground">
                {t("completed")} · {shortDateTime(reconciliation.closed_at)}
              </p>
            ) : null}
          </section>
        </>
      )}
    </AppShell>
  );
}
