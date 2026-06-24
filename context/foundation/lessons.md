# Lessons Learned

## Check CPU time before public launch and upgrade to Workers Paid if needed

**Context:** Cloudflare Workers free plan / production deploy / calculation API routes (FR-008–011)

**Problem:** The free Workers plan has a 10ms CPU-time limit per request. A calculation route processing 5+ years of fund transactions can exceed this silently — the Worker is killed mid-request and the user sees a generic error, not a helpful message. This is easy to miss during development because `wrangler dev` does not enforce the CPU-time limit.

**Rule:** Before public launch, run a synthetic large Allianz file (5+ years of transactions) through the calculation API route under `wrangler dev --remote` and measure CPU time. If the hot loop exceeds ~8ms, upgrade to Workers Paid ($5/month) before go-live.

**Applies to:** implement, impl-review

## Always regenerate package-lock.json against the public registry before first CI run

**Context:** CI/CD setup / npm ci / any project where the lockfile was generated behind a corporate or internal npm registry

**Problem:** `npm ci` fails with `npm error Exit handler never called!` when `package-lock.json` contains `resolved` URLs pointing to an internal registry that the CI environment cannot reach. The error message gives no hint about the registry — it looks like a Node/npm version bug.

**Rule:** Before wiring CI, verify that all `resolved` entries in `package-lock.json` point to `registry.npmjs.org`. If they don't, switch `.npmrc` to the public registry, delete the lockfile, run `npm install`, and commit the regenerated lockfile.

**Applies to:** implement, impl-review
