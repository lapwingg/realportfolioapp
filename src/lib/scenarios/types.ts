// Shared contract between computeScenarios (amounts) and computeAvailability
// (date-derived labels). One file so a future reader sees the full helper
// surface without jumping between modules. See
// context/changes/withdrawal-scenarios-dashboard/plan.md (Phase 2).

export type ScenarioId = "immediate" | "illness" | "housing" | "retirement";

export interface ScenarioInput {
  units: string | number;
  source: string;
  transaction_date: string;
  gross_amount: string | number;
}

export interface ScenarioAmount {
  id: ScenarioId;
  netAmount: number;
  // gainLoss/gainLossPercent are null for `illness` and `housing` (deliberately
  // omitted — partial withdrawal / loan; comparison vs own capital is
  // misleading), and null for any scenario when ownInvested === 0.
  gainLoss: number | null;
  gainLossPercent: number | null;
  breakdown: Record<string, number>;
}

export interface ScenarioAvailability {
  id: ScenarioId;
  // available iff today is between (inclusive) availableFrom and availableUntil.
  // Either bound may be null meaning "unbounded that side".
  available: boolean;
  availableFrom: string | null;
  availableUntil: string | null;
}

export interface ScenariosResult {
  currentValuation: number;
  ownInvested: number;
  cutoffDate: string | null;
  scenarios: ScenarioAmount[];
}
