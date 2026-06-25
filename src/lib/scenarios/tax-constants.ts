// Single source of truth for every numeric constant used by the scenarios
// math. Each constant carries a `// source: TODO` slot the implementer MUST
// replace with an authoritative URL + retrieval date before merging Phase 2.
//
// Verification protocol: cross-check each value against ISAP (Ustawa o PPK,
// Ustawa o podatku dochodowym od osób fizycznych) or mojeppk.pl. If an
// authoritative source cannot be found for a constant, that constant is
// wrong and this phase does not merge. The TODO comment names the article
// number my training data suggests; the implementer confirms or corrects.

export const BELKA_TAX_RATE = 0.19 as const;
// source: TODO (ISAP — ustawa o podatku dochodowym od osób fizycznych, art. 30a) — retrieved YYYY-MM-DD

export const EMPLOYER_RETAINED_FRACTION = 0.7 as const;
export const EMPLOYER_TO_ZUS_FRACTION = 0.3 as const;
// source: TODO (Ustawa o PPK art. 105) — retrieved YYYY-MM-DD

export const STATE_FORFEITED = true as const;
// source: TODO (Ustawa o PPK art. 105) — retrieved YYYY-MM-DD

export const ILLNESS_WITHDRAWAL_FRACTION = 0.25 as const;
// source: TODO (Ustawa o PPK art. 101) — retrieved YYYY-MM-DD

export const HOUSING_LOAN_MAX_FRACTION = 1.0 as const;
// source: TODO (Ustawa o PPK art. 98) — retrieved YYYY-MM-DD

// Inclusive vs exclusive boundary: IMPLEMENTER MUST VERIFY against the
// statute. Code treats `today < birthDate + HOUSING_LOAN_MAX_AGE years` as
// available (i.e. exclusive on the 45th birthday — turning 45 ends eligibility).
export const HOUSING_LOAN_MAX_AGE = 45 as const;
// source: TODO

export const HOUSING_LOAN_REPAYMENT_YEARS = 5 as const;
// source: TODO

export const RETIREMENT_AGE = 60 as const;
// source: TODO (Ustawa o PPK art. 99) — retrieved YYYY-MM-DD

export const RETIREMENT_LUMP_SUM_FRACTION = 0.25 as const;
export const RETIREMENT_INSTALMENT_FRACTION = 0.75 as const;
export const RETIREMENT_INSTALMENT_MONTHS = 120 as const;
// source: TODO (Ustawa o PPK art. 99) — retrieved YYYY-MM-DD
