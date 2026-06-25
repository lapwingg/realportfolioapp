import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { extractPrice } from "@/lib/analizy/parse";
import { ANALIZY_URL, TICKER } from "@/lib/analizy/types";

export const prerender = false;

function redirectToDashboard(context: Parameters<APIRoute>[0], params: Record<string, string>): Response {
  const qs = new URLSearchParams(params).toString();
  return context.redirect(`/dashboard?${qs}`, 303);
}

function priceErrorRedirect(context: Parameters<APIRoute>[0], reason: string): Response {
  return redirectToDashboard(context, { priceError: reason });
}

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin", 303);
  }

  // Outbound fetch: explicit UA + bounded timeout. analizy.pl can 403 the default
  // undici UA on some routes; the 8s timeout sits well inside the Worker budget.
  let response: Response;
  try {
    response = await fetch(ANALIZY_URL, {
      headers: { "User-Agent": "real-value-portfolio-app/0.1 (+contact)" },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const reason =
      msg.includes("timed out") || msg.includes("aborted") ? "Request timed out after 8s" : `Network error: ${msg}`;
    return priceErrorRedirect(context, reason);
  }

  if (!response.ok) {
    return priceErrorRedirect(context, `HTTP ${String(response.status)} from analizy.pl`);
  }

  const result = extractPrice(await response.text());
  if (!result.ok) {
    return priceErrorRedirect(context, result.error);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return priceErrorRedirect(context, "Server not configured");
  }

  // Dedup read FIRST: if the latest stored price for this user/ticker matches,
  // skip the insert and signal ?dedup=1. RLS scopes both read and write to
  // auth.uid(), so no inter-user race; a double-click within a user is benign.
  const { data: latest, error: readErr } = await supabase
    .from("price_snapshots")
    .select("price")
    .eq("ticker", TICKER)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readErr) {
    return priceErrorRedirect(context, readErr.message);
  }

  if (latest && parseFloat(String(latest.price)) === result.price) {
    return redirectToDashboard(context, { priced: "1", dedup: "1" });
  }

  const { error: writeErr } = await supabase.from("price_snapshots").insert({ ticker: TICKER, price: result.price });

  if (writeErr) {
    return priceErrorRedirect(context, writeErr.message);
  }

  return redirectToDashboard(context, { priced: "1" });
};
