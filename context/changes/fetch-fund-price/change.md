---
change_id: fetch-fund-price
title: Fetch PPK fund unit price from analizy.pl and show portfolio valuation
status: implemented
created: 2026-06-25
updated: 2026-06-25
archived_at: null
---

## Notes

Implements roadmap slice S-02 (`fetch-fund-price`) from `context/foundation/roadmap.md`.

Outcome: a signed-in user can trigger a price fetch from analizy.pl for the single PPK fund ticker and see their current portfolio valuation alongside the timestamp of the fetched price.

PRD refs: US-01, FR-006 (on-demand price fetch from analizy.pl, one ticker), FR-007 (valuation + fetch timestamp visible together).

Prerequisites: F-01 (done). Can run in parallel with S-01 (done). Unblocks S-03 together with S-01.

Unknowns to resolve at `/10x-plan` time:
- Exact analizy.pl URL and DOM path for the relevant PPK fund unit price (inspect the live page).

Risks (from roadmap):
- analizy.pl can change its page structure silently — fetch must surface a visible error on failure and must NEVER display a stale price as current (FR-007).
