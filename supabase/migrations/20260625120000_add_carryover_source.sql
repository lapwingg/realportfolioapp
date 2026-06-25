-- Add 'carryover' value to contribution_source enum to support persisting
-- Allianz Zamiana (fund-conversion) events as synthetic transactions rows.
-- See context/changes/fund-conversion-cutoff/plan.md (Phase 1).
alter type public.contribution_source add value if not exists 'carryover';
