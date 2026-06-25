import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { extractPrice, extractPriceText, parsePriceText } from "../src/lib/analizy/parse";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

// Captured 2026-06-25 from
// https://www.analizy.pl/fundusze-ppk/ALL88/allianz-plan-emerytalny-2055
// Visible price text under "Aktualna wartość J.U.": 206,29 PLN (page "as-of" date 24.06.2026).
const EXPECTED_PRICE = 206.29;

let assertions = 0;
function check<T>(actual: T, expected: T, label: string): void {
  assert.deepEqual(actual, expected, label);
  assertions += 1;
}

// --- parsePriceText: headline failure-mode cases ---
const polishComma = parsePriceText("12,3456");
check(polishComma.ok, true, "parsePriceText accepts Polish decimal comma");
if (!polishComma.ok) throw new Error("unreachable");
check(polishComma.price, 12.3456, "parsePriceText normalizes Polish comma to 12.3456");
check(polishComma.priceText, "12,3456", "parsePriceText preserves original priceText");

check(parsePriceText("12,3456 PLN").ok, false, "parsePriceText rejects stray currency symbol");
check(parsePriceText("1 234,56").ok, false, "parsePriceText rejects thousand-separator space");
check(parsePriceText("12.34.56").ok, false, "parsePriceText rejects double dot");
check(parsePriceText("-1,5").ok, false, "parsePriceText rejects sign char (non-digit prefix)");
check(parsePriceText("").ok, false, "parsePriceText rejects empty string");

// --- Fixture happy path ---
const html = readFileSync(resolve(repoRoot, "tests/fixtures/analizy-sample.html"), "utf8");

const extractedText = extractPriceText(html);
check(extractedText.ok, true, "extractPriceText finds the price node in the fixture");
if (!extractedText.ok) throw new Error("unreachable");

const result = extractPrice(html);
check(result.ok, true, "extractPrice succeeds on fixture");
if (!result.ok) throw new Error("unreachable");
assert.ok(
  Math.abs(result.price - EXPECTED_PRICE) < 0.0001,
  `expected price ${String(EXPECTED_PRICE)}, got ${String(result.price)}`,
);
assertions += 1;

// --- Negative DOM path: in-memory selector miss ---
const corrupted = html.replace(/productBigText/g, "removedClassName");
const corruptedResult = extractPrice(corrupted);
check(corruptedResult.ok, false, "extractPrice fails when selector matches no element");
if (corruptedResult.ok) throw new Error("unreachable");
assert.ok(
  corruptedResult.error.includes("Selector matched no element"),
  `expected 'Selector matched no element' in error, got "${corruptedResult.error}"`,
);
assertions += 1;

// eslint-disable-next-line no-console
console.log(`verify-price-parser: ${String(assertions)} assertions passed`);
