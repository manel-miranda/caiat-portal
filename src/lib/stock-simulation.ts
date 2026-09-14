/**
 * Admin-only stock simulation helpers (testing tool).
 *
 * Everything goes through permission-checked SECURITY DEFINER RPCs that write
 * through the normal inventory ledger, so the simulated week exercises exactly
 * the same code paths the app relies on. Simulated rows are identifiable:
 * consumption movements use `source_type = 'simulation'` and simulated
 * purchases carry a `[SIM]` note. `resetSimulation` removes only those.
 */
import { supabase } from "@/integrations/supabase/client";

export type SimulationScenario = "quiet" | "normal" | "busy" | "stress";

export const SIMULATION_SCENARIOS: SimulationScenario[] = ["quiet", "normal", "busy", "stress"];

export type SimulationItem = {
  key: string;
  label: string;
  unit: string;
  consumed: number;
  stock_before: number;
  stock_after: number;
  status_before: string;
  status_after: string;
  recommended_quantity: number;
};

export type SimulationSummary = {
  run_id: string;
  scenario: string;
  days: number;
  meals: number;
  items: SimulationItem[];
};

const num = (v: unknown) => Number(v ?? 0);

function parseSummary(raw: unknown): SimulationSummary {
  const r = (raw ?? {}) as Record<string, unknown>;
  const items = Array.isArray(r["items"]) ? (r["items"] as Record<string, unknown>[]) : [];
  return {
    run_id: String(r["run_id"] ?? ""),
    scenario: String(r["scenario"] ?? ""),
    days: Number(r["days"] ?? 0),
    meals: Number(r["meals"] ?? 0),
    items: items.map((i) => ({
      key: String(i["key"] ?? ""),
      label: String(i["label"] ?? ""),
      unit: String(i["unit"] ?? ""),
      consumed: num(i["consumed"]),
      stock_before: num(i["stock_before"]),
      stock_after: num(i["stock_after"]),
      status_before: String(i["status_before"] ?? "good"),
      status_after: String(i["status_after"] ?? "good"),
      recommended_quantity: num(i["recommended_quantity"]),
    })),
  };
}

/** Runs one simulated week. The caller supplies the run id so a retry is a no-op. */
export async function runSimulation(scenario: SimulationScenario): Promise<SimulationSummary> {
  const { data, error } = await supabase.rpc(
    "inventory_simulate_week" as never,
    { p_run_id: crypto.randomUUID(), p_scenario: scenario } as never,
  );
  if (error) throw error;
  return parseSummary(data);
}

export type SimulationPurchaseResult = { purchase_id: string; lines: number; total: number };

/** Records a simulated replenishment purchase from the current recommendations. */
export async function runSimulatedPurchase(): Promise<SimulationPurchaseResult> {
  const { data, error } = await supabase.rpc(
    "inventory_simulate_purchase" as never,
    { p_purchase_id: crypto.randomUUID() } as never,
  );
  if (error) throw error;
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    purchase_id: String(r["purchase_id"] ?? ""),
    lines: Number(r["lines"] ?? 0),
    total: num(r["total"]),
  };
}

export type SimulationHistoryResult = SimulationSummary & {
  purchases: number;
  total_cost: number;
};

/**
 * Seeds ~30 days of tagged historical usage plus backdated demo purchases so
 * forecasting, supplier context and purchase history have data to work with.
 */
export async function seedDemoHistory(days = 30): Promise<SimulationHistoryResult> {
  const { data, error } = await supabase.rpc(
    "inventory_simulate_history" as never,
    { p_run_id: crypto.randomUUID(), p_days: days } as never,
  );
  if (error) throw error;
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    ...parseSummary(data),
    purchases: Number(r["purchases"] ?? 0),
    total_cost: num(r["total_cost"]),
  };
}

export type SimulationResetResult = { movements: number; purchases: number; runs: number };

/** Removes simulator-created movements, simulated purchases and run records. */
export async function resetSimulation(): Promise<SimulationResetResult> {
  const { data, error } = await supabase.rpc("inventory_simulation_reset" as never, {} as never);
  if (error) throw error;
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    movements: Number(r["movements"] ?? 0),
    purchases: Number(r["purchases"] ?? 0),
    runs: Number(r["runs"] ?? 0),
  };
}

export const simulationRunsQuery = {
  queryKey: ["inventory", "simulation-runs"],
  queryFn: async (): Promise<SimulationSummary[]> => {
    const { data, error } = await supabase
      .from("inventory_simulation_runs" as never)
      .select("summary, created_at")
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) throw error;
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) =>
      parseSummary(r["summary"]),
    );
  },
};

export function simulationErrorKey(raw: string): string {
  if (raw.includes("PERMISSION_DENIED")) return "adminOnly";
  if (raw.includes("SIM_NOTHING_TO_BUY")) return "simNothingToBuy";
  if (raw.includes("SCENARIO_INVALID")) return "simScenarioInvalid";
  return "";
}
