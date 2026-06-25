---
change_id: supabase-schema-rls
title: Supabase schema + Row-Level Security for user-scoped data
roadmap_id: F-01
status: implementing
created: 2026-06-25
updated: 2026-06-25
---

# Change: Supabase schema + Row-Level Security for user-scoped data

Foundation slice F-01 from `context/foundation/roadmap.md`. Creates the user-scoped Supabase schema (`transactions`, `price_snapshots`) with FORCE Row-Level Security and a pgTAP test that proves cross-account isolation. Unlocks S-01 (Allianz import), S-02 (price fetch), S-03 (withdrawal dashboard).

- Plan: `plan.md`
- Brief: `plan-brief.md`
- PRD refs: Access Control, NFR (data isolation)
