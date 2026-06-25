---
project: "Real Value Portfolio App"
version: 1
status: draft
created: 2026-06-24
updated: 2026-06-25
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: Real Value Portfolio App

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

A PPK (Pracownicze Plany Kapitałowe) account holder sees their balance displayed as a pre-tax gross valuation — legally accurate but economically misleading. The product replaces that gross number with the actual after-tax amount the holder can take home under three withdrawal scenarios (immediate closure, 25% loan, retirement at 60+). PPK providers have no incentive to surface this — the raw data exists, but no platform assembles it into a per-scenario, after-tax answer for the individual holder.

## North star

**S-03: A signed-in user sees after-tax net amounts for all three withdrawal scenarios on a single dashboard** — this is where the core product hypothesis (the app correctly applies Polish tax rules per scenario and shows a number the holder can act on) first becomes visible to the user; every earlier slice is prerequisite plumbing.

> "North star" here means the smallest end-to-end slice whose successful delivery proves the core product hypothesis — placed as early as Prerequisites allow because everything else only matters if this works.

## At a glance

| ID   | Change ID                       | Outcome (user can …)                                                       | Prerequisites | PRD refs                              | Status   |
| ---- | ------------------------------- | -------------------------------------------------------------------------- | ------------- | ------------------------------------- | -------- |
| F-01 | supabase-schema-rls             | (foundation) user-scoped tables for transactions + price snapshots with RLS | —             | Access Control, NFR (data isolation)  | done     |
| S-01 | import-allianz-transactions     | upload Allianz file, see transactions persisted and categorised by source  | F-01          | US-01, FR-001, FR-003, FR-004, FR-005 | proposed |
| S-02 | fetch-fund-price                | fetch current fund unit price and see portfolio valuation with timestamp   | F-01          | US-01, FR-006, FR-007                 | proposed |
| S-03 | withdrawal-scenarios-dashboard  | see after-tax amounts for all 3 withdrawal scenarios with gain/loss        | S-01, S-02    | US-01, FR-008, FR-009, FR-010, FR-011 | proposed |

## Baseline

What's already in place in the codebase as of `2026-06-24` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 + React 19, Vite build, file-based routing in `src/pages/`, Radix UI primitives in `src/components/ui/`.
- **Backend / API:** partial — Astro SSR with Cloudflare adapter; auth API routes wired at `src/pages/api/auth/{signin,signup,signout}.ts`; no domain API endpoints yet.
- **Data:** partial — Supabase SDK integrated (`@supabase/supabase-js`, `@supabase/ssr`); NO schema or migration files (`supabase/config.toml` has `schema_paths = []`, no `.sql` files, no `seed.sql`).
- **Auth:** present — Supabase email/password auth via `@supabase/ssr`; session verified by `src/middleware.ts`; protected routes (e.g. `/dashboard`) enforced via redirect for unauthenticated users.
- **Deploy / infra:** partial — `wrangler.jsonc` configures Cloudflare Workers/Pages; `.github/workflows/ci.yml` runs CI + auto-deploys to Cloudflare on `master`; no IaC, no containers.
- **Observability:** partial — Cloudflare Workers observability flag enabled in `wrangler.jsonc:13-15`; no error-tracking library, no log middleware, no custom metrics.

## Foundations

### F-01: Supabase schema + Row-Level Security for user-scoped data

- **Outcome:** (foundation) Supabase schema migrations create user-scoped tables for transactions and price snapshots, with RLS policies enforcing "each authenticated user reads and writes only their own rows".
- **Change ID:** supabase-schema-rls
- **PRD refs:** Access Control ("flat user model — every authenticated user sees only their own data"), NFR ("no cross-account data exposure under any condition")
- **Unlocks:** S-01 (needs `transactions` table with RLS for the imported Allianz data), S-02 (needs `price_snapshots` table for fetched unit prices), S-03 (reads from both)
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** RLS misconfiguration would silently leak data across accounts — directly violates the NFR that is non-negotiable. Sequenced first because no domain slice can be safely planned or verified until the data-isolation contract exists in the schema.
- **Status:** done

## Slices

### S-01: Import Allianz transactions and categorise by source

- **Outcome:** A signed-in user can upload their Allianz statement file and see the resulting transactions persisted in their account, each categorised by contribution source (own / employer / state subsidy).
- **Change ID:** import-allianz-transactions
- **PRD refs:** US-01, FR-001 (auth — already wired in baseline; validated end-to-end here as the first authenticated user action), FR-003 (upload), FR-004 (parse + persist + dedupe), FR-005 (categorise by source)
- **Prerequisites:** F-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:**
  - Exact Allianz export file format (CSV / XLSX / PDF? column names? which field distinguishes own vs employer vs state contributions?) — Owner: user. Block: no (planner inspects a real sample file at `/10x-plan` time).
  - Deduplication strategy on re-upload — reject the duplicate file, or merge new rows and skip overlap? — Owner: user. Block: no (decided at plan time).
- **Risk:** Real Allianz files may vary across years or holder profiles; per FR-003 Socrates note, the parser must surface a clear error on failure rather than silently persisting partial or corrupt data. Sequenced before S-03 because the tax calculations consume categorised transactions.
- **Status:** proposed

### S-02: Fetch current fund unit price and show portfolio valuation

- **Outcome:** A signed-in user can trigger a price fetch from analizy.pl for the single PPK fund ticker and see their current portfolio valuation alongside the timestamp of the fetched price.
- **Change ID:** fetch-fund-price
- **PRD refs:** US-01, FR-006 (price fetch on demand from analizy.pl, one ticker), FR-007 (valuation + fetch timestamp visible together)
- **Prerequisites:** F-01
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:**
  - Exact analizy.pl URL and DOM path for the relevant PPK fund unit price — Owner: user. Block: no (discovered at plan time by inspecting the live page).
- **Risk:** analizy.pl can change its page structure silently (per FR-006 Socrates note); the fetch must show a visible error on failure and must NEVER display a stale price as current (per FR-007). Sequenced in parallel with S-01 because both depend only on F-01 and S-03 needs them together.
- **Status:** proposed

### S-03: Withdrawal scenarios dashboard (after-tax amounts + gain/loss)

- **Outcome:** A signed-in user with imported transactions and a fresh fetched price sees a single dashboard showing portfolio valuation, own invested capital, and the after-tax net amount + gain/loss vs own capital for all three withdrawal scenarios (immediate closure, 25% loan, 60+ retirement) — all visible simultaneously, not behind separate navigation.
- **Change ID:** withdrawal-scenarios-dashboard
- **PRD refs:** US-01, FR-008 (after-tax gain/loss vs own capital, per scenario), FR-009 (immediate closure: Belka tax + ZUS deductions), FR-010 (25% loan amount), FR-011 (60+ retirement withdrawal rules)
- **Prerequisites:** S-01, S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Authoritative source / current values for Belka tax rate, ZUS deduction rules for PPK closure, and 60+ retirement exemption rules — Owner: user. Block: no (planner researches and cites sources; the NFR requires correctness, not pre-confirmed rules — but planning can proceed and the chosen sources surface in the plan for review).
- **Risk:** Tax calculation correctness is non-negotiable per NFR — silent rounding or estimation errors are unacceptable, so the plan must include explicit tax-parameter sources and unit tests against worked examples. Also see `context/foundation/lessons.md` on Cloudflare Workers CPU-time limits — a multi-year transaction history can blow the 10ms free-plan budget during calculation. Sequenced last because all prerequisites must be in place before the calculation surface can be exercised end-to-end with real categorised data and a current price.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                       | Suggested issue title                                                | Ready for `/10x-plan` | Notes                                          |
| ---------- | ------------------------------- | -------------------------------------------------------------------- | --------------------- | ---------------------------------------------- |
| F-01       | supabase-schema-rls             | Add Supabase schema + RLS for user-scoped transactions and prices    | yes                   | Run `/10x-plan supabase-schema-rls` first      |
| S-01       | import-allianz-transactions     | Upload, parse and categorise Allianz transactions                    | no                    | Blocked on F-01                                |
| S-02       | fetch-fund-price                | Fetch fund unit price from analizy.pl and show valuation             | no                    | Blocked on F-01; can run in parallel with S-01 |
| S-03       | withdrawal-scenarios-dashboard  | After-tax dashboard for all three withdrawal scenarios               | no                    | Blocked on S-01 and S-02                       |

## Open Roadmap Questions

1. **Timeline tension: hard deadline 2026-07-05 is 11 days from today (2026-06-24), significantly shorter than the 4-week MVP estimate. How will scope be adjusted if the deadline cannot be extended?** — Owner: user. Block: roadmap-wide (gates whether further scope cuts are needed before any slice is planned; the current Parked list reflects only PRD §Non-Goals, not deadline-driven cuts).

## Parked

- **Other PPK providers (PZU, PKO, Generali, etc.)** — Why parked: PRD §Non-Goals; only the Allianz export format is supported in MVP.
- **Manual transaction entry / editing / deletion** — Why parked: PRD §Non-Goals; data enters the app only via file upload.
- **Mobile app (iOS / Android)** — Why parked: PRD §Non-Goals; web only in MVP.
- **Multi-asset support (IKE, IKZE, stocks, bonds)** — Why parked: PRD §Non-Goals; PPK only.
- **Premium tier / monetisation / feature gating** — Why parked: PRD §Non-Goals.
- **PDF export, price auto-refresh, historical chart, multiple fund support** — Why parked: PRD §Non-Goals (explicitly deferred to v2).

## Done

(Empty. `/10x-archive` will flip an item's `Status` to `done` and append an entry here when a change whose `Change ID` matches a roadmap item is archived. Do not pre-populate.)

- **F-01: (foundation) Supabase schema migrations create user-scoped tables for transactions and price snapshots, with RLS policies enforcing "each authenticated user reads and writes only their own rows".** — Archived 2026-06-25 → `context/archive/2026-06-25-supabase-schema-rls/`. Lesson: —.
