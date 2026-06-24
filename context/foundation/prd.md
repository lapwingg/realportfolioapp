---
project: "Real Value Portfolio App"
version: 1
status: draft
created: 2026-06-23
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 4
  hard_deadline: "2026-07-05"
  after_hours_only: true
---

## Vision & Problem Statement

A PPK (Pracownicze Plany Kapitałowe) account holder sees their balance displayed as a pre-tax gross valuation — the number the platform shows is legally accurate but economically misleading. The holder cannot answer the question that actually matters for planning: "how much can I actually take home if I withdraw today, retire at 60, or take a loan against this account?"

PPK providers have no incentive to surface the after-tax reality. Displaying gross AUM makes returns look larger and engagement higher. The raw data exists (contribution history, fund unit prices, tax rules), but no platform assembles it into a per-scenario, after-tax answer for the individual holder.

## User & Persona

**Primary persona: individual PPK account holder**

A person enrolled in PPK through their employer (in Poland), accumulating contributions across three sources (their own, employer, state subsidy). They check their account balance periodically and want to understand not the gross valuation but the actual amount available under different withdrawal conditions: retirement (age 60+), a repayable loan-like withdrawal, or an immediate early closure.

The persona is not a financial professional — they want a calculated answer, not a formula. They have access to their own Allianz (or similar) statement file and can upload it.

## Success Criteria

### Primary

- A logged-in PPK holder can upload their Allianz transaction file, see their contributions categorised by source (own / employer / state), fetch the current fund unit price, and receive after-tax withdrawal amounts for all three scenarios (immediate closure, 25% loan, retirement at 60+), compared against their own invested capital.

### Secondary

- No secondary outcomes in MVP. All extras (PDF export, price auto-refresh, historical chart, multiple fund support) are explicitly deferred to v2.

### Guardrails

- A logged-in user must only ever see their own data; no cross-account data leakage under any condition.
- After-tax amounts must be computed from actual Polish tax rules for each scenario; silent rounding errors or estimation are not acceptable.

## User Stories

### US-01: Holder sees their real after-tax position

- **Given** a logged-in PPK holder who has uploaded their Allianz file and fetched the current fund price
- **When** they view their dashboard
- **Then** they see their current portfolio valuation, their own invested capital, profit/loss percentage, and the after-tax net amount for each of three withdrawal scenarios (immediate closure, 25% loan, retirement at 60+)

#### Acceptance Criteria
- All three scenario amounts are shown simultaneously, not behind separate navigation steps
- Each amount is computed from actual Polish tax rules for that scenario, not estimated
- The profit/loss figure compares the after-tax amount (per scenario) against own contributions only (not employer or state contributions)

## Functional Requirements

### Authentication

- FR-001: User can register and log in with an email address and password. Priority: must-have
  > Socrates: Counter-argument considered: "registration friction costs more than it gives in MVP for a personal tool." Resolution: kept; multi-user login is required for server-side data isolation. FR-002 merged here as login is implied by registration and was flagged as redundant.

### Import

- FR-003: User can upload an Allianz transaction file. Priority: must-have
  > Socrates: Counter-argument considered: "analizy.pl could change its format, breaking the parser silently." Resolution: kept; parser must surface a clear error on parse failure rather than silently proceeding with corrupt data.

- FR-004: App parses transactions from the uploaded file and saves them. Priority: must-have
  > Socrates: Counter-argument considered: "re-uploading the same file creates duplicates." Resolution: kept; deduplication logic (detect and reject or merge re-uploads) is a required part of this FR's implementation.

- FR-005: App categorises each saved transaction by contribution source (own / employer / state subsidy). Priority: must-have
  > Socrates: No counter-argument; it stands as written. Source categorisation is the foundation of the profit/loss comparison.

### Valuation

- FR-006: User can fetch the current fund unit price on demand (from analizy.pl, one ticker). Priority: must-have
  > Socrates: Counter-argument considered: "analizy.pl could change its page structure, breaking the scraper silently." Resolution: kept; the app must show a visible error when price fetch fails and must never display a stale price as current.

- FR-007: User can view their current portfolio valuation alongside the timestamp of the last price fetch. Priority: must-have
  > Socrates: Counter-argument considered: "without showing the fetch timestamp, 'current' is misleading if the price is a day old." Resolution: FR updated to include the timestamp requirement explicitly.

- FR-008: User can view after-tax gain/loss compared to their own invested capital, for each withdrawal scenario. Priority: must-have
  > Socrates: Counter-argument considered: "comparing gross (pre-tax) valuation vs own capital gives a misleadingly optimistic gain figure — inconsistent with the product's core purpose." Resolution: FR revised; the gain/loss comparison uses after-tax amounts per scenario, not gross valuation.

### Withdrawal scenarios

- FR-009: User can view the net amount receivable under immediate account closure (after Belka tax and ZUS deductions). Priority: must-have
  > Socrates: No counter-argument; it stands as written. Immediate closure is the baseline scenario.

- FR-010: User can view the amount available as a 25% loan against their account. Priority: must-have
  > Socrates: Counter-argument considered: "25% of current valuation is trivial math — does this deserve a dedicated FR?" Resolution: kept as a named output; it is a distinct scenario the product promises to display, even if the computation is simple.

- FR-011: User can view the amount receivable under 60+ retirement withdrawal rules. Priority: must-have
  > Socrates: No counter-argument; it stands as written. Retirement scenario is a core planning case.

## Non-Functional Requirements

- A holder's financial data is never readable by any other user or accessible to the operator beyond what is necessary to operate the service; no cross-account data exposure under any condition.
- Tax calculation correctness is non-negotiable: the after-tax amount displayed must reflect actual Polish tax rules for each scenario; silent estimation or rounding errors are not acceptable.
- The full price fetch and calculation cycle completes within a few seconds of the user triggering it; visible result in under 5 seconds under normal network conditions.
- The product is usable on all major desktop browsers (Chrome, Firefox, Safari, Edge — latest two major versions each).

## Business Logic

Given a PPK holder's full contribution history and the current fund unit price, the app calculates the real after-tax net amount available at this moment under each withdrawal scenario (immediate closure, 25% loan, 60+ retirement) by applying the applicable Polish tax rules — replacing the gross pre-tax balance shown by the provider with a number the holder can actually act on.

Inputs the rule consumes: the holder's transaction history (categorised by contribution source: own, employer, state subsidy), the current fund unit price fetched from analizy.pl, and the applicable Polish tax parameters (Belka tax rate, ZUS deduction rules, retirement exemption conditions).

Output: three scenario-specific after-tax amounts, each compared against the holder's own invested capital to show real gain or loss.

The user encounters the output as a dashboard shown after uploading their file and triggering a price fetch — all three scenario amounts appear simultaneously, not behind separate navigation.

## Access Control

Login required (email address and password or OAuth). Flat user model — every authenticated user sees only their own data. No admin role, no guest access, no team or sharing features in MVP.

An unauthenticated visitor hitting a gated route is redirected to sign-in. Sign-up creates a new account tied to the user's email. Data persisted server-side so the holder can access their history from any device.

## Non-Goals

- No PPK providers other than Allianz — only the Allianz export file format is supported; PZU, PKO, Generali, and others are out of scope.
- No manual transaction entry, editing, or deletion — data enters the app only via file upload; no per-transaction CRUD interface.
- No mobile app — web only in MVP; no iOS or Android version.
- No multi-asset support — PPK only; IKE, IKZE, stocks, bonds, and other investment vehicles are out of scope.
- No premium features or monetisation — no paid tier, no subscription, no feature gating in MVP.
- No PDF export, price auto-refresh, historical chart, or multiple fund support — all explicitly deferred to v2.

## Open Questions

1. **Timeline tension**: The hard deadline of 2026-07-05 is 12 days from the shape session date (2026-06-23), which is significantly shorter than the 4-week MVP estimate. How will scope be adjusted if the deadline cannot be extended? — Owner: user. Block: yes for delivery planning.
