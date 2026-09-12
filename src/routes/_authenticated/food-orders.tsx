/**
 * PREVIEW-ONLY staff view for the food ordering prototype.
 *
 * Gated to Lovable preview hosts client-side (default hidden) so the published
 * production UI is unchanged. Nothing here posts a charge: "Delivered" is a
 * preview state only.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { mad } from "@/lib/format";
import { t } from "@/lib/i18n";
import { isDemoPreviewHost } from "@/lib/demo-menu";
import {
  PREVIEW_STATUS_LABEL,
  PREVIEW_TIMING_LABEL,
  nextStatus,
  previewOrdersQuery,
  setPreviewOrderStatus,
  type PreviewOrder,
} from "@/lib/preview-orders";

export const Route = createFileRoute("/_authenticated/food-orders")({
  head: () => ({
    meta: [
      { title: "Food orders (preview) — Caiat Operations" },
      {
        name: "description",
        content:
          "Preview-only prototype screen for demo food orders sent from the guest portal. No billing or real kitchen orders.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Food orders (preview) — Caiat Operations" },
      {
        property: "og:description",
        content: "Prototype kitchen board for preview food orders at Caiat.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FoodOrdersPage,
});

function FoodOrdersPage() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    setAllowed(isDemoPreviewHost(window.location.hostname));
  }, []);

  return (
    <AppShell title={t("foodOrdersTitle")}>
      {allowed ? <Board /> : <p className="text-sm text-muted-foreground">{t("noResults")}</p>}
    </AppShell>
  );
}

function Board() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const q = useQuery(previewOrdersQuery);
  const [busy, setBusy] = useState(false);
  const manage = can("requests_manage");

  async function move(order: PreviewOrder, status: PreviewOrder["status"]) {
    setBusy(true);
    try {
      await setPreviewOrderStatus(order.id, status);
      await queryClient.invalidateQueries({ queryKey: ["preview-food-orders"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  }

  const orders = q.data ?? [];

  return (
    <>
      <p className="rounded-xl bg-amber-500/10 p-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
        {t("previewOrderBanner")}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{t("foodOrdersIntro")}</p>

      {q.isLoading ? (
        <p className="surface-card mt-3 p-3 text-sm text-muted-foreground">{t("loading")}</p>
      ) : orders.length === 0 ? (
        <p className="surface-card mt-3 p-3 text-sm text-muted-foreground">{t("noFoodOrders")}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {orders.map((o) => {
            const next = nextStatus(o.status);
            return (
              <li key={o.id} className="surface-card p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {o.room_label ?? "—"}
                      {o.guest_first_name ? ` · ${o.guest_first_name}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString()} ·{" "}
                      {t(PREVIEW_TIMING_LABEL[o.timing])}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase">
                      {t(PREVIEW_STATUS_LABEL[o.status])}
                    </span>
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-400">
                      {t("previewBadge")}
                    </span>
                  </div>
                </div>

                <ul className="mt-2 space-y-1 text-sm">
                  {o.items.map((i) => (
                    <li key={i.id} className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        {i.quantity} × {i.label}
                      </span>
                      <span className="shrink-0">{mad(i.line_total)}</span>
                    </li>
                  ))}
                </ul>

                {o.notes ? (
                  <p className="mt-2 rounded-xl bg-muted/50 p-2 text-xs">{o.notes}</p>
                ) : null}

                <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-2 text-sm font-semibold">
                  <span>{t("subtotal")}</span>
                  <span>{mad(o.subtotal)}</span>
                </div>

                {manage ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {next ? (
                      <Button
                        size="sm"
                        className="tap-target rounded-xl"
                        disabled={busy}
                        onClick={() => void move(o, next)}
                      >
                        {t(PREVIEW_STATUS_LABEL[next])}
                      </Button>
                    ) : null}
                    {o.status !== "cancelled" && o.status !== "delivered" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="tap-target rounded-xl"
                        disabled={busy}
                        onClick={() => void move(o, "cancelled")}
                      >
                        {t("foStatusCancelled")}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
