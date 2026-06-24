# Cloudflare Workers Deployment Plan

## Context

The project (`real-value-portfolio-app`) is a Supabase-backed Astro 6 SSR app that is already configured for Cloudflare Workers via `@astrojs/cloudflare@13.5.0` and `wrangler.jsonc`. The platform decision is locked in `context/foundation/infrastructure.md`. This plan covers the first production deploy, CI/CD wiring, and risk mitigations for the three highest-likelihood failure modes identified in the infra research.

---

## Phases

### Phase 1 — Local pre-flight (no platform mutations)

- [x] **1.1 Rename worker** in `wrangler.jsonc`: changed `"name": "10x-astro-starter"` → `"real-value-portfolio-app"`. Guard comment added.
- [x] **1.2 Create `.dev.vars`** at repo root (gitignored) with `SUPABASE_URL` and `SUPABASE_KEY`. Already in `.gitignore`.
- [x] **1.3 Verify local build** — `npm run build` completed successfully. `.dev.vars` secrets picked up correctly.
- [x] **1.4 Smoke-test in wrangler dev** — `wrangler dev` started clean on `http://localhost:8788`. SESSION/IMAGES bindings run in local simulation (expected). All auth pages and API routes present.

> **Note:** The adapter auto-enables SESSION (KV) and IMAGES bindings. In local dev these are simulated. For production deploy, wrangler will auto-provision the SESSION KV namespace in your Cloudflare account on first `wrangler deploy` — no manual action required.

**Gate: ✅ All four steps green.**

---

### Phase 2 — Cloudflare account setup (manual human gates)

> **Human-only steps.** The agent does not execute these — they require browser OAuth or interactive terminal input.

- [x] **2.1 Authenticate wrangler** — wrangler CLI installed, Cloudflare account configured, Supabase cloud project and GitHub repo in place.

- [x] **2.2 Upload secrets to Cloudflare** — `SUPABASE_URL` and `SUPABASE_KEY` uploaded. Wrangler auto-created the Worker stub `real-value-portfolio-app` in Cloudflare during secret upload.

- [x] **2.3 Verify secrets are registered** — `wrangler secret list` confirms both secrets present.

**Gate: ✅ Both secrets registered.**

---

### Phase 3 — First production deploy

- [x] **3.1 Build**:
  ```bash
  npm run build
  ```

- [x] **3.2 Deploy** (use this exact command — NOT `wrangler pages deploy`):
  ```bash
  npx wrangler deploy
  ```
  The CLI prints the Worker URL on success (e.g. `https://real-value-portfolio-app.<account>.workers.dev`).

- [x] **3.3 Verify auth page loads** — navigate to the Worker URL; the index/auth page should render (not a 500 or blank page).

- [x] **3.4 Verify API routes are reachable** — attempt sign-up or sign-in; a Supabase auth error is acceptable (proves the route resolved), a 404 means the Worker is not wired correctly.

- [ ] **3.5 Check for SESSION KV auto-provision** — after first deploy, open Cloudflare dashboard → Workers & Pages → KV. The `@astrojs/cloudflare` adapter may auto-create a `SESSION` KV namespace binding. If it appears: note it in `README.md` ("SESSION KV is auto-created by the Cloudflare adapter; no user data is stored there"). This is informational — no action required unless compliance asks.

- [ ] **3.6 Tail live logs** to confirm no silent errors:
  ```bash
  npx wrangler tail real-value-portfolio-app --format pretty --status error
  ```
  Run this in a second terminal while clicking through the app. Any 1101 (CPU limit) or 500 errors surface here.

**Gate:** Auth page loads, API routes return non-404 responses, no 1101 errors in tail.

---

### Phase 4 — CI/CD wiring

- [x] **4.1 Add `CLOUDFLARE_API_TOKEN` to GitHub repository secrets** (Settings → Secrets and variables → Actions). Use the scoped token from Step 2.1.

- [x] **4.2 Extend `.github/workflows/ci.yml`** — add a `deploy` job that runs only on push to `master`, after the `ci` job succeeds:

  ```yaml
  deploy:
    needs: ci
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/master' && github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
  ```

  > **Why rebuild in the deploy job?** The `ci` job's artifact is not passed between jobs by default; a clean build in the deploy job is the safest approach for a solo project with no artifact-passing setup.

- [x] **4.3 Verify the pipeline** by merging a trivial change to `master` (e.g. a README line) and confirming the `deploy` job completes green in GitHub Actions.

**Gate:** `deploy` job runs successfully end-to-end on a real push.

---

### Phase 5 — Risk mitigations

#### Risk R1: 10ms CPU-time limit (Medium likelihood, High impact)

- [ ] **5.1 Profile the calculation route** — once FR-008/009/010/011 are implemented, run a synthetic large Allianz file (5+ years of transactions) through the API route using `wrangler dev` and time the CPU-bound work. If the calculation loop exceeds ~8ms of CPU time, upgrade to Workers Paid ($5/month) before public launch.
- [x] **5.2 Add the upgrade step to the pre-launch checklist** in `context/foundation/lessons.md` so it is not forgotten under deadline pressure.

#### Risk R2: `analizy.pl` blocking Cloudflare IPs (Medium likelihood, High impact)

- [ ] **5.3 Test the price fetch immediately after first deploy** — invoke the price-fetch API route (FR-006) from the deployed Worker URL. If it returns a 403 or CAPTCHA response instead of the fund unit price:
  - Short-term: implement server-side KV caching of the last known price with a TTL (reduces fetch frequency, lowering detection risk).
  - Medium-term: route the fetch through a residential proxy or schedule the fetch via a Cloudflare Cron Trigger that runs once per day and writes to KV.
- [ ] **5.4 Add a structured error response** to the price-fetch route so that a blocked fetch returns `{ price: null, error: "price_unavailable", lastKnown: <cached> }` rather than a 500 — the UI can degrade gracefully.

#### Risk R3: Wrong wrangler command under pressure (Medium likelihood, High impact)

- [x] **5.5 Add a `deploy` script to `package.json`**:
  ```json
  "deploy": "astro build && wrangler deploy"
  ```
  This makes `npm run deploy` the canonical one-command deploy and eliminates `wrangler pages deploy` as a muscle-memory risk. The CI deploy job should call this same script.
- [x] **5.6 Add a comment in `wrangler.jsonc`** clarifying: "This is a Workers deploy — use `wrangler deploy`, NOT `wrangler pages deploy`."

---

### Phase 6 — Operational setup

- [ ] **6.1 Rollback drill** — before the first user-facing launch, practice the rollback procedure:
  ```bash
  npx wrangler deployments list           # find the previous version ID
  npx wrangler rollback <version-id> -m "drill rollback"
  npx wrangler deployments list           # confirm active version changed
  npx wrangler rollback <version-id> -m "restore after drill"
  ```
  Document the version IDs used. Time-to-revert target: under 60 seconds.

- [ ] **6.2 Save Cloudflare Worker URL** — `https://real-value-portfolio-app.kamilczajka2.workers.dev` (deployed 2026-06-24).

---

## Critical Files

| File | Change |
|---|---|
| `wrangler.jsonc` | Rename `name` from `10x-astro-starter` → `real-value-portfolio-app`; add guard comment |
| `.dev.vars` | Create with `SUPABASE_URL` and `SUPABASE_KEY` for `wrangler dev` |
| `.github/workflows/ci.yml` | Add `deploy` job (Phase 4.2) |
| `package.json` | Add `"deploy"` script (Phase 5.5) |

---

## Verification (End-to-End)

1. `npx wrangler dev` starts without errors; auth pages render in the browser.
2. `npm run build && npx wrangler deploy` completes; CLI prints Worker URL.
3. Navigating to Worker URL: auth page renders, sign-up flow reaches Supabase (no 404 on API routes).
4. `npx wrangler tail real-value-portfolio-app --status error` shows no 1101 or unhandled 500s.
5. GitHub Actions `deploy` job runs green on next push to `master`.
6. Rollback drill completes in under 60 seconds.

---

## Out of Scope

- Staging environment (`[env.staging]` in wrangler.jsonc + Cloudflare Access rule) — deferred post-MVP
- Custom domain wiring — deferred post-MVP
- FR-006 through FR-011 implementation (this plan covers infra only, not feature development)
- Supabase schema migrations (handled separately; rollback caveat: DB schema does not revert with Worker rollback)
