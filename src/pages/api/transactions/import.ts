import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseAllianzCsv } from "@/lib/allianz/parse";
import { categoriseRows } from "@/lib/allianz/categorise";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin", 303);
  }

  const form = await context.request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return context.redirect(`/setup?error=${encodeURIComponent("No file uploaded")}`, 303);
  }

  const csvText = await file.text();
  const parsed = parseAllianzCsv(csvText);
  if (!parsed.ok) {
    return context.redirect(`/setup?error=${encodeURIComponent(parsed.error)}`, 303);
  }

  const categorised = categoriseRows(parsed.rows);
  const payload = [
    ...categorised.map((row) => ({
      transaction_date: row.valuation_date,
      source: row.source,
      units: Number(row.units),
      gross_amount: Number(row.gross_amount),
    })),
    ...parsed.carryovers.map((c) => ({
      transaction_date: c.valuation_date,
      source: "carryover" as const,
      units: Number(c.units),
      gross_amount: 0,
    })),
  ];

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/setup?error=${encodeURIComponent("Server not configured")}`, 303);
  }

  const { data, error } = await supabase
    .from("transactions")
    .upsert(payload, {
      onConflict: "user_id,transaction_date,source,units,gross_amount",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) {
    return context.redirect(`/setup?error=${encodeURIComponent("Database error: " + error.message)}`, 303);
  }

  const imported = data.length;
  const skipped = payload.length - imported;
  return context.redirect(`/setup?imported=${String(imported)}&skipped=${String(skipped)}`, 303);
};
