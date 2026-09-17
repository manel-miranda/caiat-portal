import { useRef, useState, type MouseEvent, type ReactNode } from "react";
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
import { DashboardKpiSheet } from "@/components/DashboardKpiSheet";
import { StatCard } from "@/components/ui/stat-card";
import { requirePermission } from "@/lib/admin-guard";
import { financeReportQuery } from "@/lib/finance";
import { mad, shortDate } from "@/lib/format";
import { inventoryStatusQuery, purchasesQuery } from "@/lib/inventory";
import { t, useLang } from "@/lib/i18n";

type FinanceDetail =
  | "stockValue"
  | "coverage"
  | "attention"
  | "recommendedBuy"
  | "purchases"
  | "margin"
  | "costCoverage";

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
  const inventory = useQuery(inventoryStatusQuery);
  const purchases = useQuery(purchasesQuery);
  const [detail, setDetail] = useState<FinanceDetail | null>(null);
  const detailOpenerRef = useRef<HTMLButtonElement | null>(null);

  const dishes = report.data?.dishes ?? [];
  const ingredients = report.data?.ingredients ?? [];
  const ingredientCosts = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const stockRows = (inventory.data ?? []).flatMap((row) => {
    const ingredient = ingredientCosts.get(row.id);
    if (ingredient?.unitCost == null) return [];

    const unitCost = Number(ingredient.unitCost);
    return [{ ...row, unitCost, value: Math.max(row.estimated_stock, 0) * unitCost }];
  });
  const coverageRows = stockRows
    .filter((row) => row.days_remaining != null && row.avg_daily_usage > 0)
    .sort((a, b) => Number(a.days_remaining) - Number(b.days_remaining));
  const attentionRows = stockRows
    .filter((row) => row.status !== "good")
    .sort(
      (a, b) =>
        Number(a.days_remaining ?? Number.POSITIVE_INFINITY) -
          Number(b.days_remaining ?? Number.POSITIVE_INFINITY) || a.label.localeCompare(b.label),
    );
  const buyRows = stockRows
    .filter((row) => row.recommended_quantity > 0)
    .map((row) => ({ ...row, buyCost: row.recommended_quantity * row.unitCost }))
    .sort((a, b) => b.buyCost - a.buyCost);
  const known = dishes.filter((dish) => dish.marginPercent != null);
  const missingCosts = dishes
    .filter((dish) => dish.missingCost)
    .sort((a, b) => a.label.localeCompare(b.label));
  const leastProfitable = [...known].sort(
    (a, b) => Number(a.marginPercent) - Number(b.marginPercent),
  );
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
  const purchaseRows = (purchases.data ?? [])
    .filter(
      (purchase) =>
        new Date(purchase.purchased_at).getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000,
    )
    .sort(
      (a, b) =>
        new Date(b.purchased_at).getTime() - new Date(a.purchased_at).getTime() ||
        a.supplier_name?.localeCompare(b.supplier_name ?? "") ||
        0,
    );

  function openDetail(next: FinanceDetail, event: MouseEvent<HTMLButtonElement>) {
    detailOpenerRef.current = event.currentTarget;
    setDetail(next);
  }

  const detailTitle =
    detail === "stockValue"
      ? t("financeStockValue")
      : detail === "coverage"
        ? t("financeStockCoverage")
        : detail === "attention"
          ? t("financeItemsNeedAttention")
          : detail === "recommendedBuy"
            ? t("financeRecommendedBuyCost")
            : detail === "purchases"
              ? t("financePurchaseSpend30d")
              : detail === "margin"
                ? t("financeDishes")
                : t("financeCostCoverage");
  const detailScope =
    detail === "coverage"
      ? t("financeStockCoverageHint")
      : detail === "attention"
        ? t("financeItemsNeedAttentionHint")
        : detail === "recommendedBuy"
          ? t("financeRecommendedBuyHint")
          : detail === "purchases"
            ? t("financeComparedWithPrevious")
            : detail === "margin"
              ? t("financeAverageHint")
              : detail === "costCoverage"
                ? t("financeCostCoverageHint")
                : t("financeStockValueHint");

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
              onClick={(event) => openDetail("stockValue", event)}
              expanded={detail === "stockValue"}
              controls="finance-detail"
            />
            <StatCard
              icon={<Timer className="size-4" />}
              label={t("financeStockCoverage")}
              value={
                summary.stockCoverageDays == null
                  ? t("financeStockNoCoverage")
                  : t("financeDays", { count: summary.stockCoverageDays.toFixed(1) })
              }
              hint={t("financeStockCoverageHint")}
              tone={
                summary.stockCoverageDays != null && summary.stockCoverageDays < 3
                  ? "warning"
                  : "default"
              }
              onClick={(event) => openDetail("coverage", event)}
              expanded={detail === "coverage"}
              controls="finance-detail"
            />
            <StatCard
              icon={<CircleAlert className="size-4" />}
              label={t("financeItemsNeedAttention")}
              value={summary.lowStockItems}
              hint={t("financeItemsNeedAttentionHint")}
              tone={summary.lowStockItems > 0 ? "warning" : "success"}
              onClick={(event) => openDetail("attention", event)}
              expanded={detail === "attention"}
              controls="finance-detail"
            />
          </FinanceSection>

          <FinanceSection title={t("financePurchasing")}>
            <StatCard
              icon={<ShoppingCart className="size-4" />}
              label={t("financeRecommendedBuyCost")}
              value={mad(summary.recommendedBuyCost)}
              hint={t("financeRecommendedBuyHint")}
              onClick={(event) => openDetail("recommendedBuy", event)}
              expanded={detail === "recommendedBuy"}
              controls="finance-detail"
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
              onClick={(event) => openDetail("purchases", event)}
              expanded={detail === "purchases"}
              controls="finance-detail"
            />
          </FinanceSection>

          <FinanceSection title={t("financeProfitability")}>
            <StatCard
              icon={<UtensilsCrossed className="size-4" />}
              label={t("financeAverage")}
              value={averageMargin == null ? "—" : `${averageMargin.toFixed(1)}%`}
              hint={t("financeAverageHint")}
              onClick={(event) => openDetail("margin", event)}
              expanded={detail === "margin"}
              controls="finance-detail"
            />
            <StatCard
              icon={<ChartNoAxesCombined className="size-4" />}
              label={t("financeCostCoverage")}
              value={`${dishes.filter((dish) => !dish.missingCost).length}/${dishes.length}`}
              hint={t("financeCostCoverageHint")}
              tone={missingCosts.length > 0 ? "warning" : "success"}
              onClick={(event) => openDetail("costCoverage", event)}
              expanded={detail === "costCoverage"}
              controls="finance-detail"
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
                        {t("financeLastPurchase")} {shortDate(ingredient.lastPurchasedAt)}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <DashboardKpiSheet
            open={detail !== null}
            onOpenChange={(open) => !open && setDetail(null)}
            title={detailTitle}
            scope={detailScope}
            openerRef={detailOpenerRef}
            contentId="finance-detail"
          >
            {detail === "stockValue" ? (
              <DetailList
                rows={[...stockRows].sort((a, b) => b.value - a.value)}
                empty={stockRows.length === 0}
                render={(row) => (
                  <DetailRow
                    label={row.label}
                    meta={`${row.estimated_stock} ${row.unit}`}
                    value={mad(row.value)}
                  />
                )}
              />
            ) : null}
            {detail === "coverage" ? (
              <DetailList
                rows={coverageRows}
                empty={coverageRows.length === 0}
                render={(row) => (
                  <DetailRow
                    label={row.label}
                    meta={`${t("financeDailyUsage")} · ${row.avg_daily_usage.toFixed(2)} ${row.unit}`}
                    value={t("financeDays", { count: Number(row.days_remaining).toFixed(1) })}
                    tone={Number(row.days_remaining) < 3 ? "warning" : "default"}
                  />
                )}
              />
            ) : null}
            {detail === "attention" ? (
              <DetailList
                rows={attentionRows}
                empty={attentionRows.length === 0}
                render={(row) => (
                  <DetailRow
                    label={row.label}
                    meta={`${row.estimated_stock} ${row.unit} · ${t("stockSafety")} ${row.safety_stock}`}
                    value={row.status === "buy" ? t("stockStatusBuy") : t("stockStatusLow")}
                    tone="warning"
                  />
                )}
              />
            ) : null}
            {detail === "recommendedBuy" ? (
              <DetailList
                rows={buyRows}
                empty={buyRows.length === 0}
                render={(row) => (
                  <DetailRow
                    label={row.label}
                    meta={`${t("stockRecommended")} ${row.recommended_quantity} ${row.unit}`}
                    value={mad(row.buyCost)}
                  />
                )}
              />
            ) : null}
            {detail === "purchases" ? (
              <DetailList
                rows={purchaseRows}
                empty={purchaseRows.length === 0}
                render={(purchase) => (
                  <DetailRow
                    label={purchase.supplier_name ?? t("purchaseNoSupplier")}
                    meta={`${shortDate(purchase.purchased_at)} · ${purchase.line_count} ${t(
                      "purchaseItemsCount",
                    )}`}
                    value={mad(purchase.total_cost)}
                  />
                )}
              />
            ) : null}
            {detail === "margin" ? (
              <DetailList
                rows={leastProfitable}
                empty={leastProfitable.length === 0}
                render={(dish) => (
                  <DetailRow
                    label={dish.label}
                    meta={`${t("financeGrossProfit")} ${mad(dish.grossProfit ?? 0)}`}
                    value={`${dish.marginPercent?.toFixed(1) ?? "—"}%`}
                    tone={Number(dish.marginPercent) < 30 ? "warning" : "default"}
                  />
                )}
              />
            ) : null}
            {detail === "costCoverage" ? (
              <DetailList
                rows={missingCosts}
                empty={missingCosts.length === 0}
                render={(dish) => (
                  <DetailRow
                    label={dish.label}
                    meta={t("financeMissingHint")}
                    value={t("financeMissing")}
                    tone="warning"
                  />
                )}
              />
            ) : null}
          </DashboardKpiSheet>
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

function DetailList<T extends { id: string }>({
  rows,
  empty,
  render,
}: {
  rows: T[];
  empty: boolean;
  render: (row: T) => ReactNode;
}) {
  return empty ? (
    <p className="text-sm text-muted-foreground">{t("noResults")}</p>
  ) : (
    <div className="divide-y divide-border">
      {rows.map((row) => (
        <div key={row.id}>{render(row)}</div>
      ))}
    </div>
  );
}

function DetailRow({
  label,
  meta,
  value,
  tone = "default",
}: {
  label: string;
  meta: string;
  value: string;
  tone?: "default" | "warning";
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-sm">
      <span className="min-w-0">
        <span className="block truncate font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{meta}</span>
      </span>
      <span
        className={
          tone === "warning"
            ? "shrink-0 font-semibold text-warning-foreground"
            : "shrink-0 font-semibold"
        }
      >
        {value}
      </span>
    </div>
  );
}
