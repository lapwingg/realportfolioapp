# Lessons Learned

## Check CPU time before public launch and upgrade to Workers Paid if needed

**Context:** Cloudflare Workers free plan / production deploy / calculation API routes (FR-008–011)

**Problem:** The free Workers plan has a 10ms CPU-time limit per request. A calculation route processing 5+ years of fund transactions can exceed this silently — the Worker is killed mid-request and the user sees a generic error, not a helpful message. This is easy to miss during development because `wrangler dev` does not enforce the CPU-time limit.

**Rule:** Before public launch, run a synthetic large Allianz file (5+ years of transactions) through the calculation API route under `wrangler dev --remote` and measure CPU time. If the hot loop exceeds ~8ms, upgrade to Workers Paid ($5/month) before go-live.

**Applies to:** implement, impl-review
