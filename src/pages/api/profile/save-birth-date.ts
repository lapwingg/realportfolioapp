import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_DATE_ISO = "1900-01-01";

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin", 303);
  }

  const form = await context.request.formData();
  const raw = form.get("birth_date");

  if (typeof raw !== "string" || !ISO_DATE_RE.test(raw)) {
    return context.redirect(`/setup?birthError=${encodeURIComponent("Niepoprawny format daty")}#birth-date`, 303);
  }

  const parsed = new Date(`${raw}T00:00:00Z`);
  // Round-trip equality catches invalid calendar dates like 2024-02-30 that
  // JS silently rolls forward (Feb 30 → Mar 1). Postgres would also reject
  // these, but its error string is not user-facing copy.
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    return context.redirect(`/setup?birthError=${encodeURIComponent("Niepoprawna data")}#birth-date`, 303);
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  if (raw > todayIso) {
    return context.redirect(
      `/setup?birthError=${encodeURIComponent("Data nie może być w przyszłości")}#birth-date`,
      303,
    );
  }
  if (raw < MIN_DATE_ISO) {
    return context.redirect(
      `/setup?birthError=${encodeURIComponent("Data zbyt odległa w przeszłości")}#birth-date`,
      303,
    );
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/setup?birthError=${encodeURIComponent("Server not configured")}#birth-date`, 303);
  }

  const { error } = await supabase.from("profiles").upsert(
    {
      user_id: context.locals.user.id,
      birth_date: raw,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return context.redirect(`/setup?birthError=${encodeURIComponent(error.message)}#birth-date`, 303);
  }

  return context.redirect("/setup?birthSaved=1#birth-date", 303);
};
