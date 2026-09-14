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
import { serviceLabel } from "@/lib/service-i18n";
import { requestsQuery, serviceTypesQuery, type RequestRow } from "@/lib/queries";
import { cancelRequest, completeRequest } from "@/lib/mutations";
import { previewOrdersQuery } from "@/lib/preview-orders";
import { FoodOrderCard } from "@/components/FoodOrderCard";
import { SheetDialog } from "./stays.$id";

export const Route = createFileRoute("/_authenticated/requests")({
  head: () => ({ meta: [{ title: "Requests — Caiat Operations" }] }),
  component: RequestsPage,
});

function RequestsPage() {
  const { user, can } = useAuth();
  const canManage = can("requests_manage");
  const online = useOnline();
  const queryClient = useQueryClient();
  const requests = useQuery(requestsQuery);
  const services = useQuery(serviceTypesQuery);
  const [billing, setBilling] = useState<RequestRow | null>(null);
  const [busy, setBusy] = useState(false);
  // Food orders share this inbox with normal requests.
  const orders = useQuery(previewOrdersQuery);

  const all = requests.data ?? [];
  const pending = all.filter((r) => r.status === "pending");
  const history = all.filter((r) => r.status !== "pending");
  const allOrders = orders.data ?? [];
  const openOrders = allOrders.filter((o) => o.status !== "delivered" && o.status !== "cancelled");
  const doneOrders = allOrders.filter((o) => o.status === "delivered" || o.status === "cancelled");

  const recent = [
    ...doneOrders.map((order) => ({ kind: "food" as const, order, at: order.updated_at })),
    ...history.map((request) => ({
      kind: "request" as const,
      request,
      at: request.completed_at ?? request.created_at,
    })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  function serviceFor(r: RequestRow) {
    return (services.data ?? []).find((s) => s.id === r.service_type_id);
  }

  async function finish(r: RequestRow, withCharge: boolean) {
    if (!online) {
      toast.error(t("offline"));
      return;
    }
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
    if (!online) {
      toast.error(t("offline"));
      return;
    }
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
      {openOrders.length > 0 ? (
        <ul className="mt-2 space-y-3">
          {openOrders.map((o) => (
            <FoodOrderCard key={o.id} order={o} />
          ))}
        </ul>
      ) : null}
      {pending.length === 0 ? (
        openOrders.length > 0 ? null : (
          <p className="surface-card mt-2 p-3 text-sm text-muted-foreground sm:p-4">
            {t("noResults")}
          </p>
        )
      ) : (
        <ul className="mt-2 space-y-3">
          {pending.map((r) => (
            <li key={r.id} className="surface-card p-3 sm:p-4">
              <RequestHead r={r} label={serviceLabel(serviceFor(r) ?? { label: r.label })} />
              {canManage ? (
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
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t("recentActivity")}
      </h2>
      {recent.length === 0 ? (
        <p className="surface-card mt-2 p-3 text-sm text-muted-foreground">{t("noResults")}</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {recent.map((entry) =>
            entry.kind === "food" ? (
              <FoodOrderCard key={entry.order.id} order={entry.order} />
            ) : (
              <li key={entry.request.id} className="surface-card p-4">
                <RequestHead
                  r={entry.request}
                  label={serviceLabel(serviceFor(entry.request) ?? { label: entry.request.label })}
                />
              </li>
            ),
          )}
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
              {serviceLabel(serviceFor(billing) ?? { label: billing.label })} ·{" "}
              {mad(serviceFor(billing)?.default_price ?? 0)}
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

function RequestHead({ r, label }: { r: RequestRow; label?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-base font-semibold">{label ?? r.label}</p>
        {r.created_via === "guest_portal" ? (
          <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            {t("guestOriginTag")}
          </span>
        ) : null}
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
