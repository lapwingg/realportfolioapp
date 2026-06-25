import assert from "node:assert/strict";
import { computeValuation } from "../src/lib/valuation/compute";

let assertions = 0;
function check<T>(actual: T, expected: T, label: string): void {
  assert.deepEqual(actual, expected, label);
  assertions += 1;
}

// --- No carryover rows: cutoff is null, all units summed ---
const noCarryover = computeValuation([
  { units: 10, source: "own", transaction_date: "2024-01-01" },
  { units: 5, source: "employer", transaction_date: "2024-02-01" },
]);
check(noCarryover.cutoffDate, null, "no carryover: cutoff null");
check(noCarryover.unitsSum, 15, "no carryover: sum of all units");

// --- Single carryover: pre-cutoff excluded, carryover + post-cutoff included ---
const single = computeValuation([
  { units: 100, source: "own", transaction_date: "2024-06-01" },
  { units: 30, source: "carryover", transaction_date: "2024-11-07" },
  { units: 20, source: "own", transaction_date: "2024-12-01" },
]);
check(single.cutoffDate, "2024-11-07", "single carryover: cutoff date");
check(single.unitsSum, 50, "single carryover: 30 + 20 (pre-cutoff 100 excluded)");

// --- Boundary: row dated exactly on the cutoff is included (>=, not >) ---
const boundary = computeValuation([
  { units: 7, source: "own", transaction_date: "2024-11-07" },
  { units: 30, source: "carryover", transaction_date: "2024-11-07" },
]);
check(boundary.unitsSum, 37, "boundary: row on cutoff date included");

// --- Multiple carryovers: cutoff is the LATEST; earlier carryover excluded ---
const multi = computeValuation([
  { units: 10, source: "carryover", transaction_date: "2023-05-01" },
  { units: 50, source: "own", transaction_date: "2024-01-01" },
  { units: 30, source: "carryover", transaction_date: "2024-11-07" },
  { units: 20, source: "own", transaction_date: "2024-12-01" },
]);
check(multi.cutoffDate, "2024-11-07", "multi carryover: latest cutoff wins");
check(multi.unitsSum, 50, "multi carryover: 30 + 20 (older carryover + intermediate own excluded)");

// --- String units (Supabase NUMERIC-at-runtime defense) ---
const stringUnits = computeValuation([{ units: "3.5", source: "own", transaction_date: "2024-01-01" }]);
check(stringUnits.unitsSum, 3.5, "string units parsed correctly");

// --- Empty rows ---
const empty = computeValuation([]);
check(empty.cutoffDate, null, "empty rows: cutoff null");
check(empty.unitsSum, 0, "empty rows: sum zero");

// eslint-disable-next-line no-console
console.log(`verify-valuation: ${String(assertions)} assertions passed`);
