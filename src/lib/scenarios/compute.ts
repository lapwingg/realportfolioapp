// Pure scenarios math. Takes transactions rows + current unit price; returns
// four after-tax amounts + gain/loss for the two final-withdrawal scenarios +
// per-scenario breakdown. No I/O, no globals, no Date.now(). See
// context/changes/withdrawal-scenarios-dashboard/plan.md (Phase 2).

import { computeValuation } from "@/lib/valuation/compute";
import {
  BELKA_TAX_RATE,
  EMPLOYER_RETAINED_FRACTION,
  HOUSING_LOAN_MAX_FRACTION,
  HOUSING_LOAN_REPAYMENT_YEARS,
  ILLNESS_WITHDRAWAL_FRACTION,
  RETIREMENT_INSTALMENT_FRACTION,
  RETIREMENT_INSTALMENT_MONTHS,
  RETIREMENT_LUMP_SUM_FRACTION,
} from "@/lib/scenarios/tax-constants";
import type { ScenarioAmount, ScenarioInput, ScenariosResult } from "@/lib/scenarios/types";

export function computeScenarios(rows: ScenarioInput[], currentPrice: number): ScenariosResult {
  // unitsSum + cutoffDate from the existing S-04 helper so we stay consistent
  // with the dashboard's valuation block (carryover-aware).
  const { unitsSum, cutoffDate } = computeValuation(rows);
  const currentValuation = unitsSum * currentPrice;

  // Per-source gross aggregates. Carryover rows naturally contribute 0 since
  // S-04 writes them with gross_amount = 0. Defensive parseFloat per the
  // money-columns runtime defense (README:193-195).
  let ownGross = 0;
  let employerGross = 0;
  let stateGross = 0;
  for (const row of rows) {
    const gross = parseFloat(String(row.gross_amount));
    if (row.source === "own") ownGross += gross;
    else if (row.source === "employer") employerGross += gross;
    else if (row.source === "state") stateGross += gross;
  }
  const totalGross = ownGross + employerGross + stateGross;

  // Per-source valuation share via proportional gross weights. This is the
  // only attribution method computable from our data (S-04's carryover rows
  // break per-source unit attribution).
  const ownValShare = totalGross > 0 ? currentValuation * (ownGross / totalGross) : 0;
  const employerValShare = totalGross > 0 ? currentValuation * (employerGross / totalGross) : 0;

  // --- Scenario: immediate closure (zwrot) ---
  const ownGainPart = ownValShare - ownGross;
  const employerKept = employerValShare * EMPLOYER_RETAINED_FRACTION;
  const employerGainKept = (employerValShare - employerGross) * EMPLOYER_RETAINED_FRACTION;
  const belkaOwn = Math.max(0, ownGainPart) * BELKA_TAX_RATE;
  const belkaEmployer = Math.max(0, employerGainKept) * BELKA_TAX_RATE;
  const immediateNet = ownValShare + employerKept - belkaOwn - belkaEmployer;
  const immediateGainLoss = ownGross > 0 ? immediateNet - ownGross : null;
  const immediate: ScenarioAmount = {
    id: "immediate",
    netAmount: immediateNet,
    gainLoss: immediateGainLoss,
    gainLossPercent: immediateGainLoss !== null ? immediateGainLoss / ownGross : null,
    breakdown: {
      ownValShare,
      employerKept,
      belkaOwn,
      belkaEmployer,
      stateForfeit: stateGross,
    },
  };

  // --- Scenario: illness (25% tax-free) ---
  // gain/loss omitted: partial withdrawal, comparison vs own capital misleading.
  const illness: ScenarioAmount = {
    id: "illness",
    netAmount: currentValuation * ILLNESS_WITHDRAWAL_FRACTION,
    gainLoss: null,
    gainLossPercent: null,
    breakdown: { fraction: ILLNESS_WITHDRAWAL_FRACTION, base: currentValuation },
  };

  // --- Scenario: housing loan (100%, repaid) ---
  // gain/loss omitted: it's a loan, not a withdrawal — comparison meaningless.
  const housing: ScenarioAmount = {
    id: "housing",
    netAmount: currentValuation * HOUSING_LOAN_MAX_FRACTION,
    gainLoss: null,
    gainLossPercent: null,
    breakdown: {
      fraction: HOUSING_LOAN_MAX_FRACTION,
      base: currentValuation,
      repaymentYears: HOUSING_LOAN_REPAYMENT_YEARS,
    },
  };

  // --- Scenario: retirement 60+ (tax-free under default split) ---
  const retirementNet = currentValuation;
  const retirementGainLoss = ownGross > 0 ? retirementNet - ownGross : null;
  const retirement: ScenarioAmount = {
    id: "retirement",
    netAmount: retirementNet,
    gainLoss: retirementGainLoss,
    gainLossPercent: retirementGainLoss !== null ? retirementGainLoss / ownGross : null,
    breakdown: {
      lumpSum: currentValuation * RETIREMENT_LUMP_SUM_FRACTION,
      instalmentMonthly: (currentValuation * RETIREMENT_INSTALMENT_FRACTION) / RETIREMENT_INSTALMENT_MONTHS,
      instalmentMonths: RETIREMENT_INSTALMENT_MONTHS,
    },
  };

  return {
    currentValuation,
    ownInvested: ownGross,
    cutoffDate,
    scenarios: [immediate, illness, housing, retirement],
  };
}
