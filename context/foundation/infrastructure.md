---
project: real-value-portfolio-app
researched_at: 2026-06-24
recommended_platform: Cloudflare Workers (via @astrojs/cloudflare adapter)
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 + React 19
  runtime: Cloudflare workerd (edge)
  database: Supabase (external)
  auth: Supabase Auth (external)
  storage: Supabase Storage (external)
---

## Recommendation

**Deploy on Cloudflare Workers.**

The project already has `@astrojs/cloudflare@13.5.0`, `wrangler@4.104.0`, and a fully configured `wrangler.jsonc` committed — Cloudflare Workers is not just the highest-scoring platform, it is already the configured deployment target. It scores Pass on all five agent-friendly criteria (CLI-first via wrangler, fully managed serverless, agent-readable docs via Astro's GitHub-hosted markdown, stable deterministic deploy API, and first-class agent integration via wrangler's `--install-skills` system). Combined with a free tier of 100,000 requests/day and confirmed Cloudflare familiarity, no other platform is competitive at this constraint set.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | **Total** |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Pass | **10** |
| **Netlify** | Pass | Pass | Partial | Pass | Partial (beta) | **8** |
| **Vercel** | Pass | Pass | Pass | Pass | Partial (early GA) | **9** |
| **Railway** | Pass | Pass | Partial | Pass | Fail | **7** |
| **Fly.io** | Pass | Partial | Partial | Pass | Fail | **6** |
| **Render** | Partial | Pass | Fail | Partial | Fail | **4** |

Scoring: Pass = 2, Partial = 1, Fail = 0.

**Interview weights applied:**
- Cost minimization → Cloudflare (best free tier: 100K req/day) favoured over Railway ($5/month) and Render ($7/month for SSR)
- Cloudflare familiarity → breaks ties in Cloudflare's favour
- Single region acceptable → edge-native advantage reduced, but Cloudflare's global network is still included
- External providers fine → Supabase remains as DB/auth/storage; no co-location weight applied

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Already configured in the project. `@astrojs/cloudflare@13.5.0` is the Astro-core-team–maintained adapter for Astro 6, deploying the app as a stateless Cloudflare Worker via `wrangler deploy`. The adapter targets Cloudflare's workerd edge runtime with `nodejs_compat` already enabled in `wrangler.jsonc`. Free tier: 100,000 requests/day, no bandwidth cap. CLI (`wrangler`) is comprehensive, non-interactive, and supports deploy, rollback (with version ID), and live log tailing. Cloudflare also ships a `--install-skills` agent integration (GA in wrangler 4.x) that installs wrangler command guidance into Claude Code. Docs are readable via Astro's GitHub-hosted markdown and Cloudflare's docs source on GitHub.

#### 2. Netlify

Strong runner-up. Free Starter plan includes 125,000 serverless function invocations/month and 100 GB/month bandwidth — competitive with Cloudflare's free tier for a low-QPS Polish-user app. The `@astrojs/netlify` adapter (GA for Astro 4/5; Astro 6 compatibility confirmed in project-adjacent research) emits SSR routes as Netlify Functions. CLI is non-interactive with `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` set. An official MCP server (`netlify/netlify-mcp`) is in public beta as of mid-2025. Main weakness: SSR function cold starts (200–800ms) and Astro 6 adapter compatibility requires verification. Netlify does not require switching the adapter — but switching from the already-configured Cloudflare setup would require removing `wrangler.jsonc`, installing `@astrojs/netlify`, and adding `netlify.toml`.

#### 3. Vercel

On scoring parity with Netlify (updated to 9 after the completed research confirmed Vercel publishes `llms.txt` — Pass for agent-readable docs). `@astrojs/vercel@10.0.8` supports Astro 6 (`^6.0.0`); v11 targets Astro 7 only — pin to v10. Free Hobby tier: 1M function invocations/month, 10 GB bandwidth/month. Vercel has a hosted MCP endpoint at `mcp.vercel.com` (GA) configurable via `vercel mcp`. Rollback on the Hobby tier is single-hop only. Adopting Vercel requires replacing the Cloudflare adapter and wrangler config — meaningful setup cost given the project is already wired for Cloudflare.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **10ms CPU-time free-tier limit could fail the tax calculation.** The free tier caps at 10ms of CPU execution time per invocation. The withdrawal-scenario calculations iterate over the full contribution history; a user with 5+ years of PPK history could exceed this in a single API route invocation, returning a silent 1101 error. The $5/month paid tier removes this ceiling.

2. **`analizy.pl` may block Cloudflare IP ranges.** FR-006 fetches the current fund unit price via `fetch()` from an Astro API route. Cloudflare Workers route outbound requests through Cloudflare's global IP pool. Polish financial data sites with scraping protections or geographic filters may return 403s or CAPTCHAs for requests originating from Cloudflare IPs, breaking the price fetch silently.

3. **`wrangler deploy` and `wrangler pages deploy` are not interchangeable.** This project uses Workers mode (`"main"` in `wrangler.jsonc`). Running `wrangler pages deploy` (a historically common command) deploys a static snapshot without the SSR Worker — API routes 404 in production. This distinction is not obvious under time pressure.

4. **128 MB memory limit on the free tier.** Allianz transaction files parsed as in-memory `FormData` streams must fit within the 128 MB per-invocation limit. Unlikely to be hit for typical PPK files, but possible for unusually large multi-year histories.

5. **Rollback requires a two-step workflow.** Unlike `netlify rollback`, Cloudflare rollback requires `wrangler deployments list` to find the version ID, then `wrangler rollback <version-id>`. This is scriptable but is not a one-command operation.

### Pre-Mortem — How This Could Fail

The team shipped on Cloudflare Workers and the app worked perfectly during development and testing with synthetic data. The first production failure appeared three weeks post-launch: a user with four years of contribution history uploaded their Allianz file and the API route returned an undescribed error. No alert fired — the team found out via a bug report. Investigation revealed the tax calculation loop was hitting the 10ms CPU time limit on the free plan. Moving to the $5/month paid plan resolved it, but the unexpected cost hadn't been budgeted into the MVP.

Two weeks later, the price fetch from analizy.pl began failing intermittently for roughly 30% of users. Cloudflare's outbound IPs had been detected and rate-limited by the Polish financial site's scraping protection layer. Retry logic helped temporarily but the real fix — routing the price fetch through a residential proxy or caching it server-side — added complexity and latency that the original design hadn't accounted for.

The project's final incident came during a late-night hotfix: a developer under pressure ran `wrangler pages deploy ./dist` out of muscle memory instead of `wrangler deploy`. Production went down for 40 minutes as API routes silently 404'd. Recovery required locating the previous Worker version ID in the Cloudflare dashboard — a procedure nobody had practiced — before `wrangler rollback` could be run. The team concluded that the deployment runbook was critically incomplete and that the `wrangler deploy` vs. `wrangler pages deploy` distinction needed to be documented and enforced by CI.

### Unknown Unknowns

- **CPU time billing vs. wall-clock time**: The 10ms free-tier limit is CPU execution time only — network I/O (e.g., the 1–2s `fetch()` to analizy.pl) consumes near-zero CPU while awaiting the response. The real budget risk is in CPU-bound code (parsing loops, floating-point calculations), not in I/O. Developers familiar with Lambda billing (which uses wall-clock time) often misread this constraint.
- **The auto-provisioned `SESSION` KV namespace is visible in the Cloudflare dashboard even though this project never uses it.** The `@astrojs/cloudflare` adapter automatically creates a KV binding named `SESSION` for Astro's session API. Since auth is handled by Supabase, this KV is empty and unused — but its presence in the Cloudflare dashboard may trigger compliance or audit questions about what user data is stored there.
- **`astro dev` and `wrangler dev` are two different local dev servers with different fidelity.** `astro dev` runs on Node.js and does not emulate the workerd runtime. Any code path that depends on workerd-specific APIs or the `nodejs_compat` flag behaviour should be tested in `wrangler dev`, not just `astro dev`.
- **Smart placement, if enabled, optimises for user request latency — not for outbound fetch latency.** If smart placement is turned on in `wrangler.jsonc`, the Worker may execute far from analizy.pl's servers, increasing price-fetch latency. Smart placement is not the default, but it is easy to enable accidentally.
- **`compatibility_date` in `wrangler.jsonc` is not a cosmetic setting.** Bumping the date (e.g., during a wrangler upgrade) changes the runtime semantics of `nodejs_compat` and related behaviour flags. A compatibility date bump should be treated as a configuration change requiring testing, not a routine version bump.

## Operational Story

- **Preview deploys**: `wrangler deploy --env staging` deploys to a separate Worker binding (requires a `[env.staging]` section in `wrangler.jsonc`). Without this, all deployments go to production. For PR-based previews, Cloudflare Workers does not have a built-in preview-URL system equivalent to Netlify/Vercel PR previews — a separate GitHub Actions job deploying to a staging Worker is the standard approach. Preview Workers should be protected from public crawling via a Cloudflare Access rule (add via dashboard; GA).
- **Secrets**: Supabase keys and any other sensitive env vars are stored as Cloudflare Workers Secrets: `wrangler secret put SUPABASE_URL`, `wrangler secret put SUPABASE_ANON_KEY`, `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`. Secrets are encrypted at rest and never visible after upload. For local dev, they are set in `.dev.vars` (gitignored). CI uses `CLOUDFLARE_API_TOKEN` as a repository secret to authenticate wrangler deploys.
- **Rollback**: `wrangler deployments list` to find the previous version ID, then `wrangler rollback <version-id> -m "reason"`. Time-to-revert: under 60 seconds once the version ID is known. Data caveat: Supabase DB migrations applied between deploys do not roll back automatically — the application code can be reverted but the schema change persists.
- **Approval**: Wrangler may run unattended for deploy and rollback. Destructive Cloudflare operations (delete a Worker, rotate a primary API token, modify KV namespace bindings, delete a KV namespace) are human-only — perform these via the Cloudflare dashboard, not via an agent session.
- **Logs**: `wrangler tail <worker-name>` streams live invocation logs to the terminal. Supports `--format json` for structured parsing, and `--status error` to filter to failures only. To tail logs in CI or a background agent: `wrangler tail <worker-name> --format json | jq .` — all read-only, no mutation.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Free-tier 10ms CPU limit triggers 1101 errors for users with long transaction histories | Devil's advocate | M | H | Upgrade to Workers Paid ($5/month) before public launch; profile the tax calculation route with a large synthetic dataset |
| `analizy.pl` blocks Cloudflare outbound IP ranges, breaking FR-006 | Devil's advocate | M | H | Test the price fetch from a deployed Worker immediately after first deploy; if blocked, implement server-side response caching in KV to reduce fetch frequency, or route through a Polish residential proxy |
| `wrangler pages deploy` accidentally used instead of `wrangler deploy`, silently breaking API routes | Devil's advocate | M | H | Encode `wrangler deploy` as the canonical deploy command in CI (`package.json` `deploy` script); never call `wrangler pages deploy` in this project |
| 128 MB memory limit exceeded for very large Allianz files | Devil's advocate | L | M | Stream `FormData` parsing rather than buffering the entire file; validate file size at the API route boundary before parsing |
| `compatibility_date` bump during wrangler upgrade changes runtime semantics | Unknown unknowns | L | M | Pin `compatibility_date` in `wrangler.jsonc`; treat date bumps as a configuration change requiring testing in `wrangler dev` before deploying |
| SESSION KV namespace auto-provision triggers audit or compliance questions | Unknown unknowns | L | L | Document in the project README that the `SESSION` KV binding is auto-created by the adapter but unused; data stored: none |
| Rollback blocked by inability to find version ID under incident pressure | Pre-mortem | M | M | Add `wrangler deployments list` and `wrangler rollback` to the deploy runbook; run a rollback drill before the first production deploy |

## Getting Started

1. **Authenticate wrangler:** `npx wrangler login` — opens browser OAuth with your Cloudflare account. For CI, set `CLOUDFLARE_API_TOKEN` as a repository secret and use `CLOUDFLARE_API_TOKEN=<token>` in the CI environment.

2. **Upload secrets to Cloudflare:** Run these once, then they are available to the Worker in production:
   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_ANON_KEY
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   ```
   For local development, create `.dev.vars` (gitignored) with the same keys in `KEY=value` format.

3. **Build and deploy:**
   ```bash
   npm run build        # astro build — outputs to ./dist
   npx wrangler deploy  # deploys ./dist as a Cloudflare Worker (reads wrangler.jsonc)
   ```
   The `"main"` field in `wrangler.jsonc` points to `@astrojs/cloudflare/entrypoints/server` — do NOT use `wrangler pages deploy`.

4. **Verify the deployment:** After `wrangler deploy`, the CLI prints the Worker URL. Navigate to it and confirm: the auth page loads, the upload route is reachable, and the price fetch route returns a non-error response (even if analizy.pl is unavailable, a structured error is expected — a 500 or network error in the Worker response would indicate a blocking issue).

5. **Set up live log tailing:**
   ```bash
   npx wrangler tail real-value-portfolio-app --format pretty
   ```
   Replace `real-value-portfolio-app` with the `name` field from `wrangler.jsonc`. Add `--status error` to filter to failures only during incident investigation.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (GitHub Actions wiring)
- Production-scale architecture (multi-region, HA, DR)
- Cloudflare KV / R2 / D1 as Supabase replacements (Supabase is the confirmed external provider)
