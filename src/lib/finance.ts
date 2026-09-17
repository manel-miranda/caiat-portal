import { supabase } from "@/integrations/supabase/client";
import { isPublicDemo } from "@/lib/demo";

export type FinanceComponent = {
  itemId: string;
  quantity: number;
  unitCost: number | null;
};

export type FinanceDish = {
  id: string;
  label: string;
  price: number;
  components: FinanceComponent[];
};

export type DishProfitability = {
  id: string;
  label: string;
  price: number;
  cost: number | null;
  grossProfit: number | null;
  marginPercent: number | null;
  missingCost: boolean;
};

export function calculateDishProfitability(dish: FinanceDish): DishProfitability {
  const missingCost =
    dish.components.length === 0 || dish.components.some((component) => component.unitCost == null);
  const cost = missingCost
    ? null
    : roundCurrency(
        dish.components.reduce(
          (sum, component) => sum + component.quantity * Number(component.unitCost),
          0,
        ),
      );
  const grossProfit = cost == null ? null : roundCurrency(dish.price - cost);

  return {
    id: dish.id,
    label: dish.label,
    price: dish.price,
    cost,
    grossProfit,
    marginPercent:
      grossProfit == null || dish.price <= 0
        ? null
        : roundPercent((grossProfit / dish.price) * 100),
    missingCost,
  };
}

export function rankRecommendationsByMargin(
  ids: string[],
  margins: ReadonlyMap<string, number | null>,
) {
  return [...ids].sort((a, b) => {
    const aMargin = margins.get(a);
    const bMargin = margins.get(b);
    if (aMargin == null && bMargin == null) return 0;
    if (aMargin == null) return 1;
    if (bMargin == null) return -1;
    return bMargin - aMargin;
  });
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPercent(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export type FinanceIngredient = {
  id: string;
  label: string;
  unit: string;
  unitCost: number | null;
  lastPurchasedAt: string | null;
};

export type FinanceSummary = {
  currentStockValue: number;
  recommendedBuyCost: number;
  purchaseSpend30d: number;
};

export type FinanceReport = {
  ingredients: FinanceIngredient[];
  dishes: DishProfitability[];
  summary: FinanceSummary;
};

export const financeReportQuery = {
  queryKey: ["finance", "profitability", isPublicDemo],
  queryFn: async (): Promise<FinanceReport> => {
    const { data, error } = await supabase.rpc("finance_profitability", {
      p_include_preview: isPublicDemo,
    });
    if (error) throw error;
    return data as unknown as FinanceReport;
  },
};
