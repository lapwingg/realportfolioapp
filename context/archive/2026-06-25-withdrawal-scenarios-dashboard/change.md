---
change_id: withdrawal-scenarios-dashboard
title: After-tax withdrawal scenarios dashboard (4 scenarios + birth-date timing + explanations)
status: archived
created: 2026-06-25
updated: 2026-06-25
archived_at: 2026-06-25T15:52:57Z
---

## Notes

Roadmap S-03 (north star). Extend `/dashboard` so a signed-in user sees, simultaneously, four after-tax scenario cards with per-scenario amount, gain/loss vs own contributions, an availability label derived from the user's birth date, and a per-card `<details>` explanation. Adds a `profiles` table (one row per user, RLS) for birth-date persistence, a `Setup → Dashboard` navigation, a "why setup?" intro paragraph, an Allianz-only disclaimer, and a manual CPU-budget verification step against a synthetic 5-year CSV.
