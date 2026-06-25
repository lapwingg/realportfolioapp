// Pure availability logic. Takes a birth date + "today" (parameter; never
// reads Date.now()) and returns per-scenario availability + bounding dates.
// Separated from compute.ts so the heavyweight math doesn't take a time
// parameter — `today` is only relevant for the availability labels.

import { HOUSING_LOAN_MAX_AGE, RETIREMENT_AGE } from "@/lib/scenarios/tax-constants";
import type { ScenarioAvailability } from "@/lib/scenarios/types";

function addYearsIso(iso: string, years: number): string {
  // Pure ISO YYYY-MM-DD arithmetic — does not go through Date to avoid
  // timezone shifts on a "date" (no time, no tz) value.
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(y + years, m - 1, d));
  const yy = String(next.getUTCFullYear()).padStart(4, "0");
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function toIsoDate(d: Date): string {
  const yy = String(d.getUTCFullYear()).padStart(4, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function computeAvailability(birthDate: string | null, today: Date): ScenarioAvailability[] {
  if (birthDate === null) {
    // Sentinel state: dashboard renders the "Podaj datę urodzenia..." hint
    // on every card.
    return (["immediate", "illness", "housing", "retirement"] as const).map((id) => ({
      id,
      available: false,
      availableFrom: null,
      availableUntil: null,
    }));
  }

  const todayIso = toIsoDate(today);
  const housingUntil = addYearsIso(birthDate, HOUSING_LOAN_MAX_AGE);
  const retirementFrom = addYearsIso(birthDate, RETIREMENT_AGE);

  return [
    {
      id: "immediate",
      available: true,
      availableFrom: null,
      availableUntil: null,
    },
    {
      id: "illness",
      available: true,
      availableFrom: null,
      availableUntil: null,
    },
    {
      id: "housing",
      // Exclusive on the 45th birthday — turning 45 ends eligibility.
      // See tax-constants.ts HOUSING_LOAN_MAX_AGE for the source citation.
      available: todayIso < housingUntil,
      availableFrom: null,
      availableUntil: housingUntil,
    },
    {
      id: "retirement",
      available: todayIso >= retirementFrom,
      availableFrom: retirementFrom,
      availableUntil: null,
    },
  ];
}
