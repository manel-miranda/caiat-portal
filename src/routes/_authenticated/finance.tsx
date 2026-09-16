import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChartNoAxesCombined } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/ui/stat-card";
import { requirePermission } from "@/lib/admin-guard";
import { mad } from "@/lib/format";
import { financeReportQuery } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/finance")({
  beforeLoad: requirePermission("activity_view"),
  head: () => ({ meta: [{ title: "Finance indicators — Caiat Operations" }] }),
  component: FinancePage,
});

function FinancePage() {
  const report = useQuery(financeReportQuery);
  const dishes = report.data?.dishes ?? [];
  const ingredients = report.data?.ingredients ?? [];
  const known = dishes.filter((dish) => dish.marginPercent != null);
  const averageMargin = known.length
    ? known.reduce((sum, dish) => sum + Number(dish.marginPercent), 0) / known.length
    : null;

  return (
    <AppShell title="Finance indicators">
      <p className="text-sm text-muted-foreground">
        Gross margins use the latest recorded purchase price for each recipe ingredient. Missing
        costs are shown explicitly and never guessed. These are ingredient-only estimates, not net
        profit: labour, overheads, taxes, and waste are not included.
      </p>

      {report.isError ? (
        <p className="surface-card mt-3 p-3 text-sm text-destructive">
          {(report.error as Error).message}
        </p>
      ) : report.isLoading ? (
        <p className="surface-card mt-3 p-3 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <section className="mt-4 grid grid-cols-2 gap-3">
            <StatCard
              icon={<ChartNoAxesCombined className="size-4" />}
              label="Dishes with costs"
              value={`${dishes.filter((dish) => !dish.missingCost).length}/${dishes.length}`}
            />
            <StatCard
              icon={<ChartNoAxesCombined className="size-4" />}
              label="Average dish margin (unweighted)"
              value={averageMargin == null ? "—" : `${averageMargin.toFixed(1)}%`}
            />
          </section>

          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Dish profitability
            </h2>
            <div className="surface-card divide-y divide-border">
              {dishes.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">No recipes recorded yet.</p>
              ) : (
                dishes.map((dish) => (
                  <div key={dish.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{dish.label}</p>
                      <p className="text-xs text-muted-foreground">
                        Price {mad(dish.price)} · Cost{" "}
                        {dish.cost == null ? "unknown" : mad(dish.cost)}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      {dish.missingCost ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-warning-foreground">
                          <AlertTriangle className="size-3.5" /> Missing cost
                        </span>
                      ) : (
                        <>
                          <p className="text-sm font-semibold">
                            {dish.marginPercent == null
                              ? "No selling price"
                              : `${dish.marginPercent.toFixed(1)}%`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {mad(dish.grossProfit ?? 0)} gross
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Ingredient costs
            </h2>
            <div className="surface-card divide-y divide-border">
              {ingredients.map((ingredient) => (
                <div
                  key={ingredient.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <span className="truncate font-medium">{ingredient.label}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {ingredient.unitCost == null
                      ? "Unknown"
                      : `${mad(ingredient.unitCost)} / ${ingredient.unit}`}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
