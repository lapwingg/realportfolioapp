# Repository Guidelines

Polish PPK (retirement-account) net-value calculator — Astro v6 + React v19 + TypeScript v5, deployed on Cloudflare Workers with Supabase for auth and data.

## Hard Rules

- **MVVM-C + Clean Architecture only.** ViewModels own state and logic; Coordinators own navigation; repositories and use-cases form the domain layer. A ViewModel must not import from `src/pages/` or `src/layouts/`. A page must not call a repository directly — route through a use-case.
- Node.js v22.14.0 required. Check `.nvmrc` and run `nvm use` before installing.
- Import via the `@/*` alias (maps to `src/*`); do not use `../../` relative paths across feature boundaries (see `@tsconfig.json`).
- Do not bypass Husky pre-commit hooks (`--no-verify`). The hook auto-runs `eslint --fix` on `.ts`/`.tsx`/`.astro` and `prettier --write` on `.json`/`.css`/`.md`.
- Access env vars via `astro:env/server`, not `import.meta.env`. See `@src/lib/config-status.ts`.

## Project Structure

- `src/components/<feature>/` — React client components grouped by feature (e.g. `auth/SignInForm.tsx`)
- `src/components/` — Astro static components (Banner, Topbar, Welcome)
- `src/pages/api/<feature>/<action>.ts` — API route handlers
- `src/pages/auth/` — auth pages; `src/pages/` — app pages
- `src/lib/` — shared utilities, Supabase client, config validation
- `src/middleware.ts` — injects `Astro.locals.user`, enforces `PROTECTED_ROUTES`
- `supabase/` — local config; Studio at `:54323`, API at `:54321`

## Auth & Data Patterns

- **Supabase client**: always `createServerClient` from `@supabase/ssr` (see `@src/lib/supabase.ts`). Never `createClient` — it breaks SSR cookie handling on Cloudflare Workers.
- **User in pages**: read `const { user } = Astro.locals` (injected by middleware). Do not call Supabase auth directly inside a page or layout.
- **Auth flow**: client form → `fetch` POST to `/api/auth/<action>` → Supabase → redirect on success, `?error=<msg>` query param on failure.
- **Route protection**: add paths to `PROTECTED_ROUTES` array in `src/middleware.ts:4`. Unauthenticated requests redirect to `/auth/signin`.
- **Config validation**: add new env checks to `configStatuses[]` in `src/lib/config-status.ts`; missing vars surface as Banner warnings in `Layout.astro`.
- **React hydration**: use `client:load` on interactive React components in Astro pages (e.g. `<SignInForm client:load />`).
- **API route shape**: handler exports `APIRoute`, handles POST only, returns `Response` — see `@src/pages/api/auth/signin.ts` as the reference.

## Build & Dev Commands

- `npm run dev` — local Astro dev server
- `npm run build` — production build (requires `SUPABASE_URL` and `SUPABASE_KEY`)
- `npm run lint` / `npm run lint:fix` — ESLint
- `npm run format` — Prettier

No test framework configured; CI gates on lint + build only (see `@.github/workflows/ci.yml`).

## Coding Style & Naming

- ESLint flat config (`@eslint.config.js`): TypeScript-ESLint strict + stylistic type-checked, React Compiler, Astro plugins, Prettier integration.
- ES Modules throughout. Astro components → `.astro`; React components → `.tsx`; utilities → `.ts`.
- UI strings are hardcoded in Polish — no i18n library. Keep new user-facing strings in Polish.

## Commit & PR Guidelines

No convention established yet. CI (`@.github/workflows/ci.yml`) requires `npm run lint` and `npm run build` to pass. Set `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets in GitHub for the build step.

## Domain Context

PPK (Polish retirement accounts): transaction import from Allianz CSV format, fund price lookup, withdrawal-scenario visualization. No in-app CRUD editing of transactions — import-only for MVP. Supabase handles auth and persistence; Cloudflare Workers is the deployment target.
