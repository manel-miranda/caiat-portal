import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, AlertTriangle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { activeStaysQuery, pendingReservationsQuery, requestsQuery } from "@/lib/queries";
import { previewOrdersQuery, useIsPreviewHost } from "@/lib/preview-orders";
import { buildTasks, taskCount } from "@/lib/tasks";

/**
 * Header bell showing outstanding work for the signed-in role. The badge is a
 * live derivation of the operational queries, so it clears itself as soon as
 * the underlying record is handled (here or in another tab).
 */
export function TaskBell() {
  const { can } = useAuth();
  const canApprove = can("reservations_manage");
  const [open, setOpen] = useState(false);
  const stays = useQuery(activeStaysQuery);
  const requests = useQuery(requestsQuery);
  const pending = useQuery({ ...pendingReservationsQuery, enabled: canApprove });
  const previewHost = useIsPreviewHost();
  const orders = useQuery({ ...previewOrdersQuery, enabled: previewHost });

  const groups = buildTasks({
    canApprove,
    stays: stays.data ?? [],
    requests: requests.data ?? [],
    pendingReservations: canApprove ? (pending.data ?? []) : [],
    pendingFoodOrders: previewHost
      ? (orders.data ?? []).filter((o) => o.status === "requested")
      : [],
  });
  const count = taskCount(groups);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t("openTasks")}
        className="relative flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors active:bg-muted"
      >
        <Bell className="size-5" />
        {count > 0 && (
          <span className="absolute -end-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold leading-5 text-primary-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-start">
            <SheetTitle>{t("tasks")}</SheetTitle>
          </SheetHeader>

          {count === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("tasksEmpty")}</p>
          ) : (
            <div className="mt-2 space-y-4 pb-6">
              {groups.map((group) => (
                <section key={group.key}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label} · {group.items.length}
                  </p>
                  <div className="surface-card divide-y divide-border">
                    {group.items.map((item) => (
                      <Link
                        key={item.id}
                        to={item.to}
                        {...(item.params ? { params: item.params } : {})}
                        onClick={() => setOpen(false)}
                        className="flex items-center justify-between gap-3 px-4 py-3 text-sm active:bg-muted"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{item.title}</span>
                          {item.detail && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {item.detail}
                            </span>
                          )}
                        </span>
                        {item.overdue && (
                          <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-warning">
                            <AlertTriangle className="size-3.5" />
                            {t("taskOverdue")}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
