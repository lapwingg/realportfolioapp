// Single source of truth for every numeric constant used by the scenarios
// math. Each constant carries an authoritative source citation (ISAP for the
// statutes; mojeppk.pl for plain-language confirmation) and a retrieval date.
// If a value here is changed in a future slice, the citation MUST be
// re-verified against the current statute text and the retrieval date bumped
// — silent estimation is not acceptable for tax-bearing math.

export const BELKA_TAX_RATE = 0.19 as const;
// source: ISAP — ustawa o podatku dochodowym od osób fizycznych, art. 30a
// https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU19910800350 — retrieved 2026-06-25

export const EMPLOYER_RETAINED_FRACTION = 0.7 as const;
export const EMPLOYER_TO_ZUS_FRACTION = 0.3 as const;
// source: ISAP — ustawa o PPK art. 105
// https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20180002215 — retrieved 2026-06-25

export const STATE_FORFEITED = true as const;
// source: ISAP — ustawa o PPK art. 105
// https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20180002215 — retrieved 2026-06-25

export const ILLNESS_WITHDRAWAL_FRACTION = 0.25 as const;
// source: ISAP — ustawa o PPK art. 101
// https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20180002215 — retrieved 2026-06-25

export const HOUSING_LOAN_MAX_FRACTION = 1.0 as const;
// source: ISAP — ustawa o PPK art. 98
// https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20180002215 — retrieved 2026-06-25

// Boundary semantics: code treats `today < birthDate + HOUSING_LOAN_MAX_AGE
// years` as available (exclusive on the 45th birthday — turning 45 ends
// eligibility). Matches "do ukończenia 45. roku życia" reading.
export const HOUSING_LOAN_MAX_AGE = 45 as const;
// source: ISAP — ustawa o PPK art. 98
// https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20180002215 — retrieved 2026-06-25

export const HOUSING_LOAN_REPAYMENT_YEARS = 5 as const;
// source: ISAP — ustawa o PPK art. 98
// https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20180002215 — retrieved 2026-06-25

export const RETIREMENT_AGE = 60 as const;
// source: ISAP — ustawa o PPK art. 99
// https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20180002215 — retrieved 2026-06-25

export const RETIREMENT_LUMP_SUM_FRACTION = 0.25 as const;
export const RETIREMENT_INSTALMENT_FRACTION = 0.75 as const;
export const RETIREMENT_INSTALMENT_MONTHS = 120 as const;
// source: ISAP — ustawa o PPK art. 99
// https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20180002215 — retrieved 2026-06-25
