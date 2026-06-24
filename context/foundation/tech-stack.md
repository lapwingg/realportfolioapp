---
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
---

## Why this stack

A solo developer shipping a PPK after-tax portfolio calculator in 4 after-hours weeks needs a stack that handles auth, persistent storage, and file upload with no extra setup. The 10x Astro Starter (Astro 6 + React 19 + Supabase + Cloudflare Pages) is the recommended default for `(web-app, js)` and clears all four agent-friendly gates: TypeScript throughout, strong file-based routing conventions, popular community, and current docs. Supabase provides email/password auth (FR-001) and file storage (FR-003/004) out of the box; server-side Astro API routes handle the external price fetch from analizy.pl (FR-006). All three withdrawal-scenario calculations are pure server-side logic with no special infrastructure requirement. Cloudflare Pages covers the deployment; GitHub Actions runs CI with auto-deploy on merge — the path of least friction for a solo after-hours project.
