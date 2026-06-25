import Papa from "papaparse";
import type { CarryoverRow, ParsedRow, ParseResult } from "./types";

const EXPECTED_HEADERS = [
  "Data zlecenia",
  "Numer zlecenia",
  "Data wyceny",
  "Typ zlecenia",
  "Typ",
  "Wartość zlecenia",
  "Wartość PLN (transakcji)",
  "Liczba jednostek (fundusz źródłowy)",
  "Liczba jednostek (fundusz docelowy)",
  "Fundusz źródłowy",
  "Fundusz docelowy",
  "Status zlecenia",
] as const;

const ALLOWED_ORDER_TYPES = new Set(["Kolejne nabycie", "Pierwsze nabycie"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type RawRow = Record<string, string | undefined>;

function normaliseNumber(raw: string | undefined): { ok: true; value: string } | { ok: false } {
  if (raw === undefined) return { ok: false };
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false };
  const dotted = trimmed.replace(",", ".");
  const n = Number(dotted);
  if (!Number.isFinite(n) || n <= 0) return { ok: false };
  return { ok: true, value: dotted };
}

export function parseAllianzCsv(csvText: string): ParseResult {
  const parsed = Papa.parse<RawRow>(csvText, {
    header: true,
    delimiter: ";",
    skipEmptyLines: true,
  });

  const fields = parsed.meta.fields ?? [];
  const present = new Set(fields.map((f) => f.trim()));
  const missing = EXPECTED_HEADERS.filter((h) => !present.has(h));
  const extras = fields
    .map((f) => f.trim())
    .filter((f) => !EXPECTED_HEADERS.includes(f as (typeof EXPECTED_HEADERS)[number]));
  if (missing.length > 0 || extras.length > 0) {
    return {
      ok: false,
      error: `Unexpected CSV header. Expected columns: ${EXPECTED_HEADERS.join(", ")}`,
    };
  }

  const rows: ParsedRow[] = [];
  const carryovers: CarryoverRow[] = [];
  const data = parsed.data;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowNumber = i + 2;

    const orderType = (row["Typ zlecenia"] ?? "").trim();
    const status = (row["Status zlecenia"] ?? "").trim();

    if (orderType === "Zamiana") {
      if (status !== "Zrealizowane") continue;
      const carryoverDate = (row["Data wyceny"] ?? "").trim();
      if (!ISO_DATE.test(carryoverDate)) {
        return {
          ok: false,
          error: `Row ${String(rowNumber)}: invalid Data wyceny "${carryoverDate}", expected YYYY-MM-DD`,
        };
      }
      const targetUnits = normaliseNumber(row["Liczba jednostek (fundusz docelowy)"]);
      if (!targetUnits.ok) {
        return {
          ok: false,
          error: `Row ${String(rowNumber)}: cannot parse "${row["Liczba jednostek (fundusz docelowy)"] ?? ""}" as a number in column "Liczba jednostek (fundusz docelowy)"`,
        };
      }
      carryovers.push({ valuation_date: carryoverDate, units: targetUnits.value });
      continue;
    }
    if (status !== "Zrealizowane") continue;

    if (!ALLOWED_ORDER_TYPES.has(orderType)) {
      return {
        ok: false,
        error: `Row ${String(rowNumber)}: unexpected order type "${orderType}"`,
      };
    }

    const typ = (row.Typ ?? "").trim();
    if (typ !== "Kwota") {
      return {
        ok: false,
        error: `Row ${String(rowNumber)}: expected Typ = "Kwota", got "${typ}"`,
      };
    }

    const valuationDate = (row["Data wyceny"] ?? "").trim();
    if (!ISO_DATE.test(valuationDate)) {
      return {
        ok: false,
        error: `Row ${String(rowNumber)}: invalid Data wyceny "${valuationDate}", expected YYYY-MM-DD`,
      };
    }

    const orderDate = (row["Data zlecenia"] ?? "").trim();
    if (!ISO_DATE.test(orderDate)) {
      return {
        ok: false,
        error: `Row ${String(rowNumber)}: invalid Data zlecenia "${orderDate}", expected YYYY-MM-DD`,
      };
    }

    const gross = normaliseNumber(row["Wartość PLN (transakcji)"]);
    if (!gross.ok) {
      return {
        ok: false,
        error: `Row ${String(rowNumber)}: cannot parse "${row["Wartość PLN (transakcji)"] ?? ""}" as a number in column "Wartość PLN (transakcji)"`,
      };
    }

    const units = normaliseNumber(row["Liczba jednostek (fundusz źródłowy)"]);
    if (!units.ok) {
      return {
        ok: false,
        error: `Row ${String(rowNumber)}: cannot parse "${row["Liczba jednostek (fundusz źródłowy)"] ?? ""}" as a number in column "Liczba jednostek (fundusz źródłowy)"`,
      };
    }

    rows.push({
      order_date: orderDate,
      valuation_date: valuationDate,
      units: units.value,
      gross_amount: gross.value,
    });
  }

  return { ok: true, rows, carryovers };
}
