# Allianz parser fixtures

Synthetic CSV files used by `scripts/verify-parser.ts`. The real user CSV stays out of the repo.

## `allianz-sample.csv` — 8 data rows

Exercises every structural case in `src/lib/allianz/parse.ts` + `categorise.ts`:

| Row | Order date | Role                              | Expected source       |
| --- | ---------- | --------------------------------- | --------------------- |
| 2   | 2024-01-10 | Welcome bonus (250 PLN, earliest) | `state`               |
| 3   | 2024-02-10 | Pair — larger (300 PLN)           | `own`                 |
| 4   | 2024-02-10 | Pair — smaller (225 PLN)          | `employer`            |
| 5   | 2024-03-01 | `Zamiana` (fund switch)           | filtered out          |
| 6   | 2024-03-25 | Annual state subsidy (240 PLN)    | `state`               |
| 7   | 2024-04-10 | Pair — larger (350 PLN)           | `own`                 |
| 8   | 2024-04-10 | Pair — smaller (262,50 PLN)       | `employer`            |
| 9   | 2024-05-01 | Pending (`W trakcie realizacji`)  | filtered out          |

Totals after filter + categorise:
- `own`: 2 rows, 650,00 PLN
- `employer`: 2 rows, 487,50 PLN
- `state`: 2 rows, 490,00 PLN

## `allianz-malformed.csv` — 2 data rows

One valid row (row 2), one with `Wartość PLN (transakcji) = "abc"` (row 3). The parser must reject the file with an error string starting with `Row 3:`.
