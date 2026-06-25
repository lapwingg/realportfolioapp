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

export interface CarryoverRow {
  valuation_date: string;
  units: string;
}

export type ParseResult = { ok: true; rows: ParsedRow[]; carryovers: CarryoverRow[] } | { ok: false; error: string };
