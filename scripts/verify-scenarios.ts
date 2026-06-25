import assert from "node:assert/strict";
import { computeAvailability } from "../src/lib/scenarios/availability";
import { computeScenarios } from "../src/lib/scenarios/compute";

let assertions = 0;
function check<T>(actual: T, expected: T, label: string): void {
  assert.deepEqual(actual, expected, label);
  assertions += 1;
}
function checkApprox(actual: number, expected: number, label: string, tolerance = 0.005): void {
  if (Math.abs(actual - expected) >= tolerance) {
    assert.fail(`${label}: ${String(actual)} !== ${String(expected)} (tolerance ${String(tolerance)})`);
  }
  assertions += 1;
}
function notNull<T>(value: T | null, label: string): T {
  if (value === null) {
    assert.fail(`${label}: unexpected null`);
  }
  return value;
}

// =====================================================================
// computeScenarios — scenario order is [immediate, illness, housing, retirement]
// =====================================================================

// --- Case 1: Immediate, profit, all sources ---
// own 1000 (1 unit), employer 500 (1 unit), state 240 (1 unit); price = 666.6667 → valuation ≈ 2000.
// totalGross = 1740; ownValShare = 2000 × 1000/1740 ≈ 1149.4253; employerValShare ≈ 574.7126.
// ownGainPart ≈ 149.4253 → belkaOwn ≈ 28.39080. employerKept ≈ 402.2989;
// employerGainKept ≈ 52.2989 → belkaEmployer ≈ 9.93678.
// immediateNet ≈ 1149.4253 + 402.2989 − 28.39080 − 9.93678 ≈ 1513.39655.
// gainLoss ≈ 1513.39655 − 1000 ≈ 513.39655. State 240 is forfeited.
const case1 = computeScenarios(
  [
    { units: 1, source: "own", transaction_date: "2024-01-01", gross_amount: 1000 },
    { units: 1, source: "employer", transaction_date: "2024-01-01", gross_amount: 500 },
    { units: 1, source: "state", transaction_date: "2024-01-01", gross_amount: 240 },
  ],
  2000 / 3,
);
checkApprox(case1.currentValuation, 2000, "case1 valuation");
checkApprox(case1.ownInvested, 1000, "case1 ownInvested");
const case1Immediate = case1.scenarios[0];
check(case1Immediate.id, "immediate", "case1 immediate id");
checkApprox(case1Immediate.netAmount, 1513.39655, "case1 immediate netAmount");
checkApprox(notNull(case1Immediate.gainLoss, "case1 gainLoss"), 513.39655, "case1 immediate gainLoss");
checkApprox(
  notNull(case1Immediate.gainLossPercent, "case1 gainLossPct") * 100,
  51.339655,
  "case1 immediate gainLossPercent %",
);
checkApprox(case1Immediate.breakdown.stateForfeit, 240, "case1 stateForfeit");

// --- Case 2: Immediate, loss — Belka = 0 since gain < 0 ---
// own 1000 (only source); valuation 800. ownValShare = 800; ownGainPart = −200 → belkaOwn = 0.
// immediateNet = 800; gainLoss = −200.
const case2 = computeScenarios([{ units: 1, source: "own", transaction_date: "2024-01-01", gross_amount: 1000 }], 800);
const case2Immediate = case2.scenarios[0];
checkApprox(case2Immediate.netAmount, 800, "case2 loss netAmount = ownValShare");
checkApprox(notNull(case2Immediate.gainLoss, "case2 gainLoss"), -200, "case2 loss gainLoss = -200");
checkApprox(case2Immediate.breakdown.belkaOwn, 0, "case2 loss: no Belka tax on negative gain");

// --- Case 3: Immediate, no own contributions → gainLoss = null ---
// own 0, employer 1000 (only source); valuation 1500.
// employerValShare = 1500; employerKept = 1050; employerGainKept = (1500−1000)×0.7 = 350; belkaEmployer = 66.5.
// immediateNet = 0 + 1050 − 0 − 66.5 = 983.5; gainLoss = null (ownGross = 0).
const case3 = computeScenarios(
  [{ units: 1, source: "employer", transaction_date: "2024-01-01", gross_amount: 1000 }],
  1500,
);
const case3Immediate = case3.scenarios[0];
checkApprox(case3Immediate.netAmount, 983.5, "case3 no-own netAmount");
check(case3Immediate.gainLoss, null, "case3 no-own gainLoss is null");
check(case3Immediate.gainLossPercent, null, "case3 no-own gainLossPercent is null");

// --- Case 4: Illness — 25% of valuation, gainLoss null ---
const case4Illness = case1.scenarios[1];
check(case4Illness.id, "illness", "case4 illness id");
checkApprox(case4Illness.netAmount, 500, "case4 illness = 25% of 2000");
check(case4Illness.gainLoss, null, "case4 illness gainLoss null (partial withdrawal)");

// --- Case 5: Housing — 100% of valuation, gainLoss null ---
const case5Housing = case1.scenarios[2];
check(case5Housing.id, "housing", "case5 housing id");
checkApprox(case5Housing.netAmount, 2000, "case5 housing = 100% of 2000");
check(case5Housing.gainLoss, null, "case5 housing gainLoss null (loan, not withdrawal)");
check(case5Housing.breakdown.repaymentYears, 5, "case5 housing repaymentYears");

// --- Case 6: Retirement — full valuation, breakdown ---
// valuation 2000, own 1000. netAmount = 2000; gainLoss = 1000.
// lumpSum = 500; instalmentMonthly = (2000×0.75)/120 = 12.5; instalmentMonths = 120.
const case6Retirement = case1.scenarios[3];
check(case6Retirement.id, "retirement", "case6 retirement id");
checkApprox(case6Retirement.netAmount, 2000, "case6 retirement netAmount = full");
checkApprox(notNull(case6Retirement.gainLoss, "case6 gainLoss"), 1000, "case6 retirement gainLoss = 1000");
checkApprox(case6Retirement.breakdown.lumpSum, 500, "case6 retirement lumpSum");
checkApprox(case6Retirement.breakdown.instalmentMonthly, 12.5, "case6 retirement instalmentMonthly");
check(case6Retirement.breakdown.instalmentMonths, 120, "case6 retirement instalmentMonths");

// --- Case 7: Carryover row with gross=0 contributes units to valuation but not to gross denominators ---
// carryover 30 units gross=0 on 2024-06-01 (cutoff = 2024-06-01).
// own 100 units gross=2000 on 2024-07-01; employer 50 units gross=1000 on 2024-08-01.
// All three rows ≥ cutoff → unitsSum = 30+100+50 = 180; price 30 → valuation 5400.
// totalGross = 3000 (carryover contributes 0); ownValShare = 5400×2000/3000 = 3600;
// employerValShare = 1800. ownGainPart = 1600 → belkaOwn = 304.
// employerKept = 1260; employerGainKept = (1800−1000)×0.7 = 560 → belkaEmployer = 106.4.
// immediateNet = 3600 + 1260 − 304 − 106.4 = 4449.6; gainLoss = 2449.6.
const case7 = computeScenarios(
  [
    { units: 30, source: "carryover", transaction_date: "2024-06-01", gross_amount: 0 },
    { units: 100, source: "own", transaction_date: "2024-07-01", gross_amount: 2000 },
    { units: 50, source: "employer", transaction_date: "2024-08-01", gross_amount: 1000 },
  ],
  30,
);
checkApprox(case7.currentValuation, 5400, "case7 carryover: valuation includes carryover units");
checkApprox(case7.ownInvested, 2000, "case7 ownInvested excludes carryover gross (=0)");
checkApprox(case7.scenarios[0].netAmount, 4449.6, "case7 immediate netAmount");
checkApprox(notNull(case7.scenarios[0].gainLoss, "case7 gainLoss"), 2449.6, "case7 immediate gainLoss");

// =====================================================================
// computeAvailability — entries are [immediate, illness, housing, retirement]
// =====================================================================

const today = new Date(Date.UTC(2026, 5, 25)); // 2026-06-25 (month is 0-indexed)

// --- Case 8: No birth date — all four available:false ---
const case8 = computeAvailability(null, today);
check(case8.length, 4, "case8 four entries");
for (const entry of case8) {
  check(entry.available, false, `case8 ${entry.id} available:false`);
  check(entry.availableFrom, null, `case8 ${entry.id} availableFrom null`);
  check(entry.availableUntil, null, `case8 ${entry.id} availableUntil null`);
}

// --- Case 9: Age ~30 (birth 1996-04-12) — housing available, retirement not ---
const case9 = computeAvailability("1996-04-12", today);
const case9Housing = case9[2];
const case9Retirement = case9[3];
check(case9Housing.available, true, "case9 age30 housing available");
check(case9Housing.availableUntil, "2041-04-12", "case9 age30 housingUntil = birth+45y");
check(case9Retirement.available, false, "case9 age30 retirement NOT available");
check(case9Retirement.availableFrom, "2056-04-12", "case9 age30 retirementFrom = birth+60y");

// --- Case 10: Age ~50 (birth 1976-04-12) — housing not, retirement not ---
const case10 = computeAvailability("1976-04-12", today);
check(case10[2].available, false, "case10 age50 housing NOT available");
check(case10[3].available, false, "case10 age50 retirement NOT available");

// --- Case 11: Age ~65 (birth 1961-04-12) — housing not, retirement yes ---
const case11 = computeAvailability("1961-04-12", today);
check(case11[2].available, false, "case11 age65 housing NOT available");
check(case11[3].available, true, "case11 age65 retirement available");

// --- Case 12: Boundary — exact 45th birthday → housing exclusive (NOT available) ---
// Today is 2026-06-25; birthDate = 1981-06-25 → housingUntil = 2026-06-25 = today.
// Implementation uses today < housingUntil (exclusive on the 45th birthday;
// turning 45 ends eligibility). See tax-constants.ts HOUSING_LOAN_MAX_AGE
// comment — flip to <= and update this assertion if statute proves inclusive.
const case12 = computeAvailability("1981-06-25", today);
check(case12[2].available, false, "case12 boundary: 45th birthday is exclusive");
check(case12[2].availableUntil, "2026-06-25", "case12 boundary: housingUntil matches today");

// eslint-disable-next-line no-console
console.log(`verify-scenarios: ${String(assertions)} assertions passed`);
