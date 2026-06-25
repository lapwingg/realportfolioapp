import type { CategorisedRow, ContributionSource, ParsedRow } from "./types";

const STATE_ANNUAL = 240;
const STATE_WELCOME = 250;
const STATE_TOLERANCE = 1;

interface Indexed {
  row: ParsedRow;
  amount: number;
  originalIndex: number;
}

function classifySingleton(
  item: Indexed,
  earliestValuationDate: string,
  allByOrderDate: Map<string, Indexed[]>,
): ContributionSource {
  if (Math.abs(item.amount - STATE_ANNUAL) < STATE_TOLERANCE) {
    return "state";
  }
  if (Math.abs(item.amount - STATE_WELCOME) < STATE_TOLERANCE) {
    const sameOrderDate = allByOrderDate.get(item.row.order_date) ?? [];
    if (item.row.valuation_date === earliestValuationDate && sameOrderDate.length === 1) {
      return "state";
    }
  }
  return "own";
}

export function categoriseRows(rows: ParsedRow[]): CategorisedRow[] {
  const indexed: Indexed[] = rows.map((row, originalIndex) => ({
    row,
    amount: Number(row.gross_amount),
    originalIndex,
  }));

  const byOrderDate = new Map<string, Indexed[]>();
  for (const item of indexed) {
    const list = byOrderDate.get(item.row.order_date) ?? [];
    list.push(item);
    byOrderDate.set(item.row.order_date, list);
  }

  const earliestValuationDate =
    indexed.reduce<string | null>((earliest, item) => {
      if (earliest === null || item.row.valuation_date < earliest) return item.row.valuation_date;
      return earliest;
    }, null) ?? "";

  const result = new Array<CategorisedRow | undefined>(indexed.length);

  for (const group of byOrderDate.values()) {
    if (group.length === 2) {
      const [a, b] = group;
      const larger = a.amount >= b.amount ? a : b;
      const smaller = larger === a ? b : a;
      result[larger.originalIndex] = { ...larger.row, source: "own" };
      result[smaller.originalIndex] = { ...smaller.row, source: "employer" };
      continue;
    }

    if (group.length === 1) {
      const only = group[0];
      const source = classifySingleton(only, earliestValuationDate, byOrderDate);
      result[only.originalIndex] = { ...only.row, source };
      continue;
    }

    // 3+ rows: sort by amount descending, pair off greedily, classify leftover singleton.
    const sorted = [...group].sort((x, y) => y.amount - x.amount);
    let i = 0;
    while (i + 1 < sorted.length) {
      const own = sorted[i];
      const employer = sorted[i + 1];
      result[own.originalIndex] = { ...own.row, source: "own" };
      result[employer.originalIndex] = { ...employer.row, source: "employer" };
      i += 2;
    }
    if (i < sorted.length) {
      const leftover = sorted[i];
      const source = classifySingleton(leftover, earliestValuationDate, byOrderDate);
      result[leftover.originalIndex] = { ...leftover.row, source };
    }
  }

  return result.filter((r): r is CategorisedRow => r !== undefined);
}
