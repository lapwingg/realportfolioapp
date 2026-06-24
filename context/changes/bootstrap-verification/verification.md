---
bootstrapped_at: 2026-06-24T14:39:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: real-value-portfolio-app
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: real-value-portfolio-app
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

**Why this stack:** A solo developer shipping a PPK after-tax portfolio calculator in 4 after-hours weeks needs a stack that handles auth, persistent storage, and file upload with no extra setup. The 10x Astro Starter (Astro 6 + React 19 + Supabase + Cloudflare Pages) is the recommended default for `(web-app, js)` and clears all four agent-friendly gates: TypeScript throughout, strong file-based routing conventions, popular community, and current docs. Supabase provides email/password auth (FR-001) and file storage (FR-003/004) out of the box; server-side Astro API routes handle the external price fetch from analizy.pl (FR-006). All three withdrawal-scenario calculations are pure server-side logic with no special infrastructure requirement. Cloudflare Pages covers the deployment; GitHub Actions runs CI with auto-deploy on merge — the path of least friction for a solo after-hours project.

## Pre-scaffold verification

| Signal      | Value                                      | Severity | Notes                                                    |
| ----------- | ------------------------------------------ | -------- | -------------------------------------------------------- |
| npm package | not run                                    | n/a      | cmd_template starts with `git clone`; npm check skipped  |
| GitHub repo | not run                                    | n/a      | `gh` CLI not found on this machine; check unavailable    |

Recency check unavailable — `gh` CLI not installed. WARN-AND-CONTINUE; scaffolding proceeded.

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone (upstream starter's `.git/` history deleted before move-up)
**Exit code**: 0
**Files moved**: ~40 files + `node_modules/` (774 packages)
**Conflicts (.scaffold siblings)**: `CLAUDE.md` → `CLAUDE.md.scaffold`
**.gitignore handling**: moved silently (no prior `.gitignore` in cwd)
**.bootstrap-scaffold cleanup**: deleted

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 6 HIGH, 10 MODERATE, 2 LOW
**Direct vs transitive**: 0/1/2/0 direct of total 0 CRITICAL / 6 HIGH / 10 MODERATE / 2 LOW

#### HIGH findings

| Package   | Direct? | Advisory                                                                 | CVSS | Fix available |
| --------- | ------- | ------------------------------------------------------------------------ | ---- | ------------- |
| `astro`   | yes     | GHSA-8hv8-536x-4wqp — Reflected XSS via unescaped slot name (<6.3.3)    | 7.1  | yes           |
| `astro`   | yes     | GHSA-2pvr-wf23-7pc7 — Host header SSRF in prerendered error page (<6.4.6)| 7.5  | yes           |
| `devalue` | no      | GHSA-77vg-94rm-hx3p — DoS via sparse array deserialization (5.6.3–5.8.0)| 7.5  | yes           |
| `ws`      | no      | GHSA-96hv-2xvq-fx4p — Memory exhaustion DoS (8.0.0–8.20.1)              | 7.5  | yes           |
| `vite`    | no      | GHSA-fx2h-pf6j-xcff — `server.fs.deny` bypass on Windows (7.0.0–7.3.4)  | n/a  | yes           |
| `vite`    | no      | GHSA-v6wh-96g9-6wx3 — Path handling on Windows (7.0.0–7.3.4)            | n/a  | yes           |

#### MODERATE findings

10 moderate advisories (log-only). Notable packages: `@astrojs/check` (direct), `wrangler` (direct), `@cloudflare/vite-plugin`, `@astrojs/language-server`, `volar-service-yaml`, `yaml-language-server`, `yaml`, `ws` (also has HIGH), `astro` (also has HIGH), `miniflare`. All have fixes available — run `npm audit fix` to address non-breaking fixes.

#### LOW findings

| Package       | Advisory                                                              | CVSS | Fix available |
| ------------- | --------------------------------------------------------------------- | ---- | ------------- |
| `@babel/core` | GHSA-4x5r-pxfx-6jf8 — Arbitrary File Read via sourceMappingURL (<=7.29.0) | 3.2 | yes      |
| `esbuild`     | Low severity advisory                                                 | n/a  | yes           |

## Hints recorded but not acted on

| Hint                    | Value              |
| ----------------------- | ------------------ |
| bootstrapper_confidence | first-class        |
| quality_override        | false              |
| path_taken              | standard           |
| self_check_answers      | null               |
| team_size               | solo               |
| deployment_target       | cloudflare-pages   |
| ci_provider             | github-actions     |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true               |
| has_payments            | false              |
| has_realtime            | false              |
| has_ai                  | false              |
| has_background_jobs     | false              |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- Review `CLAUDE.md.scaffold` (the starter's template CLAUDE.md) and decide if any content should be merged into your existing `CLAUDE.md`.
- Configure Supabase: copy `.env.example` → `.env` and fill in your `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- Run `npm audit fix` to address the HIGH and MODERATE findings that have non-breaking fixes available.
- `git add -A && git commit -m "chore: scaffold 10x-astro-starter"` to commit the fresh scaffold.
