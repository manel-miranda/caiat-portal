import { describe, expect, test } from "bun:test";
import {
  calculateDishProfitability,
  rankRecommendationsByMargin,
  type FinanceDish,
} from "../src/lib/finance";

describe("finance indicators", () => {
  test("missing recipes do not imply zero cost or a 100% margin", () => {
    expect(
      calculateDishProfitability({ id: "empty", label: "Empty", price: 100, components: [] }),
    ).toMatchObject({ cost: null, missingCost: true, marginPercent: null });
  });

  test("zero selling price has a known cost but no margin percentage", () => {
    expect(
      calculateDishProfitability({
        id: "free",
        label: "Free",
        price: 0,
        components: [{ itemId: "ingredient", quantity: 1, unitCost: 5 }],
      }),
    ).toMatchObject({ cost: 5, grossProfit: -5, missingCost: false, marginPercent: null });
  });
  test("calculates recipe cost, gross profit, and margin percentage", () => {
    const dish: FinanceDish = {
      id: "dish-1",
      label: "Tagine",
      price: 120,
      components: [
        { itemId: "oil", quantity: 0.1, unitCost: 40 },
        { itemId: "chicken", quantity: 0.25, unitCost: 80 },
      ],
    };

    expect(calculateDishProfitability(dish)).toEqual({
      id: "dish-1",
      label: "Tagine",
      price: 120,
      cost: 24,
      grossProfit: 96,
      marginPercent: 80,
      missingCost: false,
    });
  });

  test("marks a dish with an unknown ingredient cost instead of claiming a margin", () => {
    const dish: FinanceDish = {
      id: "dish-2",
      label: "Couscous",
      price: 100,
      components: [{ itemId: "spice", quantity: 1, unitCost: null }],
    };

    expect(calculateDishProfitability(dish)).toMatchObject({
      cost: null,
      grossProfit: null,
      marginPercent: null,
      missingCost: true,
    });
  });

  test("ranks curated recommendations by gross margin and keeps unknowns last", () => {
    const margins = new Map([
      ["low", 10],
      ["high", 80],
      ["unknown", null],
    ]);

    expect(rankRecommendationsByMargin(["low", "unknown", "high"], margins)).toEqual([
      "high",
      "low",
      "unknown",
    ]);
  });
});
