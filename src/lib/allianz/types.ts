import type { Database } from "@/lib/database.types";

export type ContributionSource = Database["public"]["Enums"]["contribution_source"];

export interface ParsedRow {
  order_date: string;
  valuation_date: string;
  units: string;
  gross_amount: string;
}

export interface CategorisedRow extends ParsedRow {
  source: ContributionSource;
}

export type ParseResult = { ok: true; rows: ParsedRow[] } | { ok: false; error: string };
