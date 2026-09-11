import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useOnline } from "@/components/OfflineBanner";
import { mad, roomLabel, shortDateTime } from "@/lib/format";
import { statusLabel, t } from "@/lib/i18n";
import { requestsQuery, serviceTypesQuery, type RequestRow } from "@/lib/queries";
import { cancelRequest, completeRequest } from "@/lib/mutations";
import { SheetDialog } from "./stays.$id";

export const Route = createFileRoute("/_authenticated/requests")({
  head: () => ({ meta: [{ title: "Requests — Caiat Operations" }] }),
  component: RequestsPage,
});

function RequestsPage() {
  const { user } = useAuth();
  const online = useOnline();
  const queryClient = useQueryClient();
  const requests = useQuery(requestsQuery);
  const services = useQuery(serviceTypesQuery);
  const [billing, setBilling] = useState<RequestRow | null>(null);
  const [busy, setBusy] = useState(false);

  const all = requests.data ?? [];
  const pending = all.filter((r) => r.status === "pending");
  const history = all.filter((r) => r.status !== "pending");

  function serviceFor(r: RequestRow) {
    return (services.data ?? []).find((s) => s.id === r.service_type_id);
  }

  async function finish(r: RequestRow, withCharge: boolean) {
    if (!online) { toast.error(t("offline")); return; }
    setBusy(true);
    try {
      const svc = serviceFor(r);
      await completeRequest({
        requestId: r.id,
        stayId: r.stay_id,
        label: r.label,
        serviceTypeId: r.service_type_id,
        unitPrice: svc?.default_price ?? 0,
        withCharge,
        userId: user?.id,
      });
      await queryClient.invalidateQueries();
      setBilling(null);
      toast.success(t("completed"));
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  }

  async function onComplete(r: RequestRow) {
    const svc = serviceFor(r);
    if (svc?.billable && r.stay_id) {
      setBilling(r);
      return;
    }
    await finish(r, false);
  }

  async function onCancel(r: RequestRow) {
    if (!online) { toast.error(t("offline")); return; }
    try {
      await cancelRequest(r.id, user?.id);
      await queryClient.invalidateQueries();
      toast.success(t("cancelled"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <AppShell title={t("navRequests")}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t("pendingRequests")}
      </h2>
      {pending.length === 0 ? (
        <p className="surface-card mt-2 p-4 text-sm text-muted-foreground">{t("noResults")}</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {pending.map((r) => (
            <li key={r.id} className="surface-card p-4">
              <RequestHead r={r} />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  onClick={() => void onComplete(r)}
                  className="tap-target rounded-xl"
                  disabled={busy}
                >
                  <Check className="size-4" /> {t("complete")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void onCancel(r)}
                  className="tap-target rounded-xl"
                  disabled={busy}
                >
                  <X className="size-4" /> {t("cancel")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t("activity")}
      </h2>
      {history.length === 0 ? (
        <p className="surface-card mt-2 p-4 text-sm text-muted-foreground">{t("noResults")}</p>
      ) : (
        <ul className="surface-card mt-2 divide-y divide-border">
          {history.map((r) => (
            <li key={r.id} className="p-4">
              <RequestHead r={r} />
            </li>
          ))}
        </ul>
      )}

      <SheetDialog
        open={Boolean(billing)}
        onClose={() => setBilling(null)}
        title={t("addChargeQuestion")}
      >
        {billing ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {billing.label} · {mad(serviceFor(billing)?.default_price ?? 0)}
            </p>
            <Button
              className="tap-target w-full rounded-xl"
              disabled={busy}
              onClick={() => void finish(billing, true)}
            >
              {t("yesAddCharge")}
            </Button>
            <Button
              variant="outline"
              className="tap-target w-full rounded-xl"
              disabled={busy}
              onClick={() => void finish(billing, false)}
            >
              {t("noJustComplete")}
            </Button>
          </div>
        ) : null}
      </SheetDialog>
    </AppShell>
  );
}

function RequestHead({ r }: { r: RequestRow }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-base font-semibold">{r.label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {r.room ? roomLabel(r.room) : "—"}
          {r.stay?.guest?.full_name ? ` · ${r.stay.guest.full_name}` : ""}
          {r.scheduled_at ? ` · ${shortDateTime(r.scheduled_at)}` : ""}
        </p>
        {r.notes ? <p className="mt-1 text-sm">{r.notes}</p> : null}
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold">
          {statusLabel(r.status)}
        </span>
        {r.stay_id ? (
          <Link
            to="/stays/$id"
            params={{ id: r.stay_id }}
            className="text-xs font-medium text-primary underline"
          >
            {t("stay")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
