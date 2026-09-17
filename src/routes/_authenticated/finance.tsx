import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChartNoAxesCombined,
  CircleAlert,
  PackageCheck,
  ShoppingCart,
  Timer,
  TrendingUp,
  UtensilsCrossed,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/ui/stat-card";
import { requirePermission } from "@/lib/admin-guard";
import { mad, shortDate } from "@/lib/format";
import { t, useLang } from "@/lib/i18n";
import { financeReportQuery } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/finance")({
  beforeLoad: requirePermission("activity_view"),
  head: () => ({
    meta: [{ title: `${t("financeTitle")} — Caiat Operations` }],
  }),
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
    purchaseSpendPrevious30d: report.data?.summary?.purchaseSpendPrevious30d ?? 0,
    stockCoverageDays: report.data?.summary?.stockCoverageDays ?? null,
    lowStockItems: report.data?.summary?.lowStockItems ?? 0,
  };
  const averageMargin = known.length
    ? known.reduce((sum, dish) => sum + Number(dish.marginPercent), 0) / known.length
    : null;
  const spendChange =
    summary.purchaseSpendPrevious30d > 0
      ? ((summary.purchaseSpend30d - summary.purchaseSpendPrevious30d) /
          summary.purchaseSpendPrevious30d) *
        100
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
          <FinanceSection title={t("financeStockHealth")}>
            <StatCard
              icon={<PackageCheck className="size-4" />}
              label={t("financeStockValue")}
              value={mad(summary.currentStockValue)}
              hint={t("financeStockValueHint")}
            />
            <StatCard
              icon={<Timer className="size-4" />}
              label={t("financeStockCoverage")}
              value={
                summary.stockCoverageDays == null
                  ? t("financeStockNoCoverage")
                  : t("financeDays", {
                      count: summary.stockCoverageDays.toFixed(1),
                    })
              }
              hint={t("financeStockCoverageHint")}
              tone={
                summary.stockCoverageDays != null && summary.stockCoverageDays < 3
                  ? "warning"
                  : "default"
              }
            />
            <StatCard
              icon={<CircleAlert className="size-4" />}
              label={t("financeItemsNeedAttention")}
              value={summary.lowStockItems}
              hint={t("financeItemsNeedAttentionHint")}
              tone={summary.lowStockItems > 0 ? "warning" : "success"}
            />
          </FinanceSection>

          <FinanceSection title={t("financePurchasing")}>
            <StatCard
              icon={<ShoppingCart className="size-4" />}
              label={t("financeRecommendedBuyCost")}
              value={mad(summary.recommendedBuyCost)}
              hint={t("financeRecommendedBuyHint")}
            />
            <StatCard
              icon={<TrendingUp className="size-4" />}
              label={t("financePurchaseSpend30d")}
              value={mad(summary.purchaseSpend30d)}
              hint={
                spendChange == null
                  ? t("financePurchaseSpendNoComparison")
                  : `${spendChange >= 0 ? "+" : ""}${spendChange.toFixed(1)}% · ${t(
                      "financeComparedWithPrevious",
                    )}`
              }
              tone={spendChange != null && spendChange > 0 ? "warning" : "default"}
            />
          </FinanceSection>

          <FinanceSection title={t("financeProfitability")}>
            <StatCard
              icon={<UtensilsCrossed className="size-4" />}
              label={t("financeAverage")}
              value={averageMargin == null ? "—" : `${averageMargin.toFixed(1)}%`}
              hint={t("financeAverageHint")}
            />
            <StatCard
              icon={<ChartNoAxesCombined className="size-4" />}
              label={t("financeCostCoverage")}
              value={`${dishes.filter((dish) => !dish.missingCost).length}/${dishes.length}`}
              hint={t("financeCostCoverageHint")}
              tone={dishes.some((dish) => dish.missingCost) ? "warning" : "success"}
            />
          </FinanceSection>

          <section className="mt-7">
            <div className="mb-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t("financeDishes")}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">{t("financeDishesHint")}</p>
            </div>
            <div className="surface-card divide-y divide-border">
              {dishes.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">{t("financeEmpty")}</p>
              ) : (
                dishes.map((dish) => (
                  <div key={dish.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-semibold">{dish.label}</p>
                      {dish.missingCost ? (
                        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-warning-foreground">
                          <AlertTriangle className="size-3.5" /> {t("financeMissing")}
                        </span>
                      ) : null}
                    </div>
                    {dish.missingCost ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("financeMissingHint")}
                      </p>
                    ) : (
                      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                        <Metric label={t("financeSellingPrice")} value={mad(dish.price)} />
                        <Metric label={t("financeFoodCost")} value={mad(dish.cost ?? 0)} />
                        <Metric
                          label={t("financeGrossProfit")}
                          value={mad(dish.grossProfit ?? 0)}
                        />
                        <Metric
                          label={t("financeMargin")}
                          value={
                            dish.marginPercent == null
                              ? t("financeNoPrice")
                              : `${dish.marginPercent.toFixed(1)}%`
                          }
                          accent
                        />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="mt-7">
            <div className="mb-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t("financeIngredients")}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">{t("financeIngredientsHint")}</p>
            </div>
            <div className="surface-card divide-y divide-border">
              {ingredients.map((ingredient) => (
                <div
                  key={ingredient.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <span className="min-w-0 truncate font-medium">{ingredient.label}</span>
                  <span className="shrink-0 text-end text-muted-foreground">
                    {ingredient.unitCost == null
                      ? t("financeUnknown")
                      : `${mad(ingredient.unitCost)} / ${ingredient.unit}`}
                    {ingredient.lastPurchasedAt ? (
                      <span className="mt-0.5 block text-xs">
                        {t("financeLastPurchase")}{" "}
                        {shortDate(ingredient.lastPurchasedAt)}
                      </span>
                    ) : null}
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

function FinanceSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={accent ? "text-sm font-semibold text-primary" : "text-sm font-semibold"}>
        {value}
      </p>
    </div>
  );
}
