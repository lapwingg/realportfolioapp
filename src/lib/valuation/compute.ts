// Pure helper for /dashboard valuation. Derives the fund-conversion cutoff
// from any source='carryover' rows in the transactions set, then sums units
// from rows dated on or after the most-recent cutoff. See
// context/changes/fund-conversion-cutoff/plan.md (Phase 3).

export interface ValuationInput {
  units: string | number;
  source: string;
  transaction_date: string;
}

export interface ValuationResult {
  unitsSum: number;
  cutoffDate: string | null;
}

export function computeValuation(rows: ValuationInput[]): ValuationResult {
  let cutoffDate: string | null = null;
  for (const row of rows) {
    if (row.source !== "carryover") continue;
    if (cutoffDate === null || row.transaction_date > cutoffDate) {
      cutoffDate = row.transaction_date;
    }
  }
  let unitsSum = 0;
  for (const row of rows) {
    if (cutoffDate !== null && row.transaction_date < cutoffDate) continue;
    unitsSum += parseFloat(String(row.units));
  }
  return { unitsSum, cutoffDate };
}
