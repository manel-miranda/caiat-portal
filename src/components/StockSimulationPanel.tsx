/**
 * Admin-only stock simulation panel (testing tool).
 *
 * Runs a simulated week of meals through the real inventory ledger so the
 * Stock, Shopping list and Purchases screens can be exercised with realistic
 * data. Every write is an admin-checked RPC; reset removes only simulated rows.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { mad } from "@/lib/format";
import { qty } from "@/lib/inventory";
import {
  resetSimulation,
  runSimulatedPurchase,
  runSimulation,
  seedDemoHistory,
  simulationErrorKey,
  SIMULATION_SCENARIOS,
  type SimulationScenario,
  type SimulationSummary,
} from "@/lib/stock-simulation";

const SCENARIO_LABEL: Record<SimulationScenario, string> = {
  quiet: "simQuiet",
  normal: "simNormal",
  busy: "simBusy",
  stress: "simStress",
};

function fail(error: unknown) {
  const message = (error as Error).message;
  const key = simulationErrorKey(message);
  toast.error(key ? t(key as never) : message);
}

export function StockSimulationPanel({ onChanged }: { onChanged: () => Promise<void> }) {
  const [scenario, setScenario] = useState<SimulationScenario>("normal");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<SimulationSummary | null>(null);

  async function run(job: () => Promise<void>) {
    setBusy(true);
    try {
      await job();
      await onChanged();
    } catch (error) {
      fail(error);
    }
    setBusy(false);
  }

  const attention = (summary?.items ?? []).filter((i) => i.status_after !== "good");
  const shopping = (summary?.items ?? []).filter((i) => i.recommended_quantity > 0);

  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-muted-foreground">{t("simIntro")}</p>

      <div className="surface-card space-y-3 p-3">
        <p className="text-sm font-semibold">{t("simScenario")}</p>
        <div className="flex flex-wrap gap-2">
          {SIMULATION_SCENARIOS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScenario(s)}
              aria-pressed={scenario === s}
              className={`min-h-9 rounded-full border px-3 text-xs font-medium ${
                scenario === s
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {t(SCENARIO_LABEL[s] as never)}
            </button>
          ))}
        </div>

        <Button
          className="w-full rounded-xl"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await runSimulation(scenario);
              setSummary(result);
              toast.success(t("simDone"));
            })
          }
        >
          {t("simRun")}
        </Button>

        <Button
          variant="outline"
          className="w-full rounded-xl"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await runSimulatedPurchase();
              toast.success(`${t("simPurchaseDone")} · ${result.lines} · ${mad(result.total)}`);
            })
          }
        >
          {t("simReplenish")}
        </Button>

        <Button
          variant="outline"
          className="w-full rounded-xl"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await seedDemoHistory(30);
              setSummary(result);
              toast.success(
                `${t("simSeedHistoryDone")} · ${result.meals} · ${result.purchases} · ${mad(
                  result.total_cost,
                )}`,
              );
            })
          }
        >
          {t("simSeedHistory")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("simSeedHistoryHint")}</p>

        <Button
          variant="ghost"
          className="w-full rounded-xl text-destructive"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await resetSimulation();
              setSummary(null);
              toast.success(`${t("simResetDone")} · ${result.movements} · ${result.purchases}`);
            })
          }
        >
          {t("simReset")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("simResetHint")}</p>
      </div>

      {summary ? (
        <div className="surface-card space-y-3 p-3">
          <p className="text-sm font-semibold">
            {t("simMeals")}: {summary.meals} · {summary.days}d ·{" "}
            {t(SCENARIO_LABEL[(summary.scenario as SimulationScenario) ?? "normal"] as never)}
          </p>

          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              {t("simConsumed")}
            </p>
            <ul className="mt-1 divide-y divide-border">
              {summary.items.map((i) => (
                <li key={i.key} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                  <span className="min-w-0 truncate">{i.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    −{qty(i.consumed)} {i.unit} · {qty(i.stock_before)} → {qty(i.stock_after)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              {t("simAttention")}
            </p>
            {attention.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">{t("simNoneAffected")}</p>
            ) : (
              <p className="mt-1 text-sm">
                {attention
                  .map(
                    (i) =>
                      `${i.label} (${t(
                        i.status_after === "buy" ? "stockStatusBuy" : "stockStatusLow",
                      )})`,
                  )
                  .join(" · ")}
              </p>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              {t("simShopping")}
            </p>
            {shopping.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">{t("stockShoppingEmpty")}</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm">
                {shopping.map((i) => (
                  <li key={i.key}>
                    {i.label} · {qty(i.recommended_quantity)} {i.unit}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <p className="surface-card p-3 text-sm text-muted-foreground">{t("simNoRun")}</p>
      )}
    </div>
  );
}
