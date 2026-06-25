import { parse } from "node-html-parser";
import type { ParseResult } from "./types";

// Selector identified by inspecting tests/fixtures/analizy-sample.html (captured 2026-06-25).
// The .productValueSumUp container holds the "Aktualna wartość J.U." block (current unit
// value); .productBigText is the visible price text inside it. Both class names appear
// exactly once on the page, so the combined selector is unique by construction.
const PRICE_SELECTOR = ".productValueSumUp .productBigText";

export function parsePriceText(text: string): ParseResult {
  const normalized = text.trim().replace(",", ".");
  // Reject anything outside a plain decimal — guards against the silent
  // parseFloat('12,3456') === 12 truncation and stray currency/thousand chars.
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return { ok: false, error: `Unparseable price text: "${text}"` };
  }
  const price = parseFloat(normalized);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: `Non-positive price: ${String(price)}` };
  }
  return { ok: true, price, priceText: text };
}

export function extractPriceText(html: string): { ok: true; text: string } | { ok: false; error: string } {
  const root = parse(html);
  const el = root.querySelector(PRICE_SELECTOR);
  if (!el) {
    return {
      ok: false,
      error: "Selector matched no element on analizy.pl page (DOM may have changed)",
    };
  }
  const text = el.text.trim();
  if (text.length === 0) {
    return {
      ok: false,
      error: "Selector matched an empty element on analizy.pl page (DOM may have changed)",
    };
  }
  return { ok: true, text };
}

export function extractPrice(html: string): ParseResult {
  const extracted = extractPriceText(html);
  if (!extracted.ok) return extracted;
  return parsePriceText(extracted.text);
}
