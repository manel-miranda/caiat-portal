/**
 * PREVIEW-ONLY food order card, shown inside the unified Requests inbox.
 * Advancing a status never posts a charge: "Delivered" is a preview state.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { mad } from "@/lib/format";
import { t } from "@/lib/i18n";
import {
  PREVIEW_STATUS_LABEL,
  PREVIEW_TIMING_LABEL,
  nextStatus,
  setPreviewOrderStatus,
  type PreviewOrder,
} from "@/lib/preview-orders";

export function FoodOrderCard({ order }: { order: PreviewOrder }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const manage = can("requests_manage");
  const next = nextStatus(order.status);

  async function move(status: PreviewOrder["status"]) {
    setBusy(true);
    try {
      await setPreviewOrderStatus(order.id, status);
      await queryClient.invalidateQueries({ queryKey: ["preview-food-orders"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <li className="surface-card p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            <UtensilsCrossed className="size-3.5" />
            {t("typeFood")}
          </span>
          <p className="mt-1 text-sm font-semibold">
            {order.room_label ?? "—"}
            {order.guest_first_name ? ` · ${order.guest_first_name}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {new Date(order.created_at).toLocaleString()} · {t(PREVIEW_TIMING_LABEL[order.timing])}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase">
            {t(PREVIEW_STATUS_LABEL[order.status])}
          </span>
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-400">
            {t("previewBadge")}
          </span>
        </div>
      </div>

      <ul className="mt-2 space-y-1 text-sm">
        {order.items.map((i) => (
          <li key={i.id} className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              {i.quantity} × {i.label}
            </span>
            <span className="shrink-0">{mad(i.line_total)}</span>
          </li>
        ))}
      </ul>

      {order.notes ? <p className="mt-2 rounded-xl bg-muted/50 p-2 text-xs">{order.notes}</p> : null}

      <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-2 text-sm font-semibold">
        <span>{t("subtotal")}</span>
        <span>{mad(order.subtotal)}</span>
      </div>

      {manage && (next || (order.status !== "cancelled" && order.status !== "delivered")) ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {next ? (
            <Button
              size="sm"
              className="tap-target rounded-xl"
              disabled={busy}
              onClick={() => void move(next)}
            >
              {t(PREVIEW_STATUS_LABEL[next])}
            </Button>
          ) : null}
          {order.status !== "cancelled" && order.status !== "delivered" ? (
            <Button
              size="sm"
              variant="outline"
              className="tap-target rounded-xl"
              disabled={busy}
              onClick={() => void move("cancelled")}
            >
              {t("foStatusCancelled")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
