import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseAllianzCsv } from "../src/lib/allianz/parse";
import { categoriseRows } from "../src/lib/allianz/categorise";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

let assertions = 0;
function check<T>(actual: T, expected: T, label: string): void {
  assert.deepEqual(actual, expected, label);
  assertions += 1;
}

const sample = readFileSync(resolve(repoRoot, "tests/fixtures/allianz-sample.csv"), "utf8");
const parsed = parseAllianzCsv(sample);
check(parsed.ok, true, "sample parses");
if (!parsed.ok) throw new Error("unreachable");
check(parsed.rows.length, 6, "sample post-filter row count");
check(parsed.carryovers.length, 1, "sample carryovers row count");
check(parsed.carryovers[0].valuation_date, "2024-03-05", "carryover valuation date matches FIX-004");
check(parsed.carryovers[0].units, "30.0000", "carryover units matches FIX-004 target side");

const categorised = categoriseRows(parsed.rows);
check(categorised.length, 6, "categorised row count matches parsed");

const bySource = categorised.reduce<Record<string, { count: number; sum: number }>>((acc, row) => {
  const slot = acc[row.source] ?? { count: 0, sum: 0 };
  slot.count += 1;
  slot.sum += Number(row.gross_amount);
  acc[row.source] = slot;
  return acc;
}, {});

check(bySource.own.count, 2, "own row count");
check(bySource.employer.count, 2, "employer row count");
check(bySource.state.count, 2, "state row count");
check(bySource.own.sum, 650, "own sum");
check(bySource.employer.sum, 487.5, "employer sum");
check(bySource.state.sum, 490, "state sum");

const malformed = readFileSync(resolve(repoRoot, "tests/fixtures/allianz-malformed.csv"), "utf8");
const badParse = parseAllianzCsv(malformed);
check(badParse.ok, false, "malformed parse rejected");
if (badParse.ok) throw new Error("unreachable");
assert.ok(badParse.error.startsWith("Row 3:"), `expected Row 3: prefix, got "${badParse.error}"`);
assertions += 1;

// eslint-disable-next-line no-console
console.log(`verify-parser: ${String(assertions)} assertions passed`);
