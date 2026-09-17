import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChartNoAxesCombined } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/ui/stat-card";
import { requirePermission } from "@/lib/admin-guard";
import { mad } from "@/lib/format";
import { t, useLang } from "@/lib/i18n";
import { financeReportQuery } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/finance")({
  beforeLoad: requirePermission("activity_view"),
  head: () => ({ meta: [{ title: `${t("financeTitle")} — Caiat Operations` }] }),
  component: FinancePage,
});

function FinancePage() {
  useLang();
  const report = useQuery(financeReportQuery);
  const dishes = report.data?.dishes ?? [];
  const ingredients = report.data?.ingredients ?? [];
  const known = dishes.filter((dish) => dish.marginPercent != null);
  const summary = {
    currentStockValue: report.data?.summary?.currentStockValue ?? 0,
    recommendedBuyCost: report.data?.summary?.recommendedBuyCost ?? 0,
    purchaseSpend30d: report.data?.summary?.purchaseSpend30d ?? 0,
  };
  const averageMargin = known.length
    ? known.reduce((sum, dish) => sum + Number(dish.marginPercent), 0) / known.length
    : null;

  return (
    <AppShell title={t("financeTitle")}>
      <p className="text-sm text-muted-foreground">{t("financeIntro")}</p>

      {report.isError ? (
        <p className="surface-card mt-3 p-3 text-sm text-destructive">
          {(report.error as Error).message}
        </p>
      ) : report.isLoading ? (
        <p className="surface-card mt-3 p-3 text-sm text-muted-foreground">{t("loading")}</p>
      ) : (
        <>
          <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard
              icon={<ChartNoAxesCombined className="size-4" />}
              label={t("financeCostCoverage")}
              value={`${dishes.filter((dish) => !dish.missingCost).length}/${dishes.length}`}
            />
            <StatCard
              icon={<ChartNoAxesCombined className="size-4" />}
              label={t("financeAverage")}
              value={averageMargin == null ? "—" : `${averageMargin.toFixed(1)}%`}
            />
            <StatCard
              icon={<ChartNoAxesCombined className="size-4" />}
              label={t("financeStockValue")}
              value={mad(summary.currentStockValue)}
            />
            <StatCard
              icon={<ChartNoAxesCombined className="size-4" />}
              label={t("financeRecommendedBuyCost")}
              value={mad(summary.recommendedBuyCost)}
            />
            <StatCard
              icon={<ChartNoAxesCombined className="size-4" />}
              label={t("financePurchaseSpend30d")}
              value={mad(summary.purchaseSpend30d)}
            />
          </section>

          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("financeDishes")}
            </h2>
            <div className="surface-card divide-y divide-border">
              {dishes.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">{t("financeEmpty")}</p>
              ) : (
                dishes.map((dish) => (
                  <div key={dish.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{dish.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("financePrice")} {mad(dish.price)} · {t("financeCost")}{" "}
                        {dish.cost == null ? t("financeUnknown") : mad(dish.cost)}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      {dish.missingCost ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-warning-foreground">
                          <AlertTriangle className="size-3.5" /> {t("financeMissing")}
                        </span>
                      ) : (
                        <>
                          <p className="text-sm font-semibold">
                            {dish.marginPercent == null
                              ? t("financeNoPrice")
                              : `${dish.marginPercent.toFixed(1)}%`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {mad(dish.grossProfit ?? 0)} {t("financeGross")}
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
              {t("financeIngredients")}
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
                      ? t("financeUnknown")
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
