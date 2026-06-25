# 10x Astro Starter

![](./public/template.png)

A modern, opinionated starter template for building fast, accessible web applications.

## Tech Stack

- [Astro](https://astro.build/) v6 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v5 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/przeprogramowani/10x-astro-starter.git
cd 10x-astro-starter
```

2. Install dependencies:

```bash
npm install
```

3. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

4. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

5. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints
│ ├── components/ # UI components (Astro & React)
│ └── assets/ # Static assets
├── public/ # Public assets
├── wrangler.jsonc # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Initialize the local Supabase project (creates a `supabase/` config folder):

```bash
npx supabase init
```

3. Start the local stack (downloads Docker images on first run):

```bash
npx supabase start
```

4. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

5. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

Migration files live under `supabase/migrations/` and are applied automatically by `supabase start`. To re-apply from zero, see the [Database](#database) section.

> **Note for environments with corporate TLS inspection** (where outbound certificate verification fails for `deno.land` and similar): `supabase start` will fail bringing up the `edge_runtime` container. Since this project does not use Edge Functions, you can exclude the unneeded containers:
>
> ```bash
> npx supabase start --exclude edge-runtime,vector,imgproxy,inbucket,realtime,storage-api
> ```

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

### Auth routes

| Route                 | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                             |
| `/auth/signup`        | Email/password sign-up form                                             |
| `/auth/confirm-email` | Post-signup "check your inbox" page                                     |
| `/dashboard`          | Example protected page (redirects to `/auth/signin` if unauthenticated) |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

## Database

Migrations under `supabase/migrations/` are applied in order. Schema state is verified by a pgTAP cross-account isolation test that proves Row-Level Security denies cross-user reads and writes at the database layer — this test **MUST stay green on every migration**; a regression here is a regression of the load-bearing PRD NFR ("no cross-account data exposure under any condition").

Local workflow:

```bash
npx supabase start    # or with --exclude flags (see Supabase Configuration note above)
npx supabase db reset # applies all migrations from zero
npx supabase test db  # runs supabase/tests/*.test.sql via pgTAP
```

### Apply migrations to the hosted project

```bash
npx supabase login                                     # one-time, opens browser
npx supabase link --project-ref <project-ref>          # ref from dashboard URL
npx supabase db push --include-all                     # applies new migrations remotely
npx supabase gen types typescript --linked > src/lib/database.types.ts  # regen types
```

> If your network blocks outbound TCP 5432 (corporate firewalls / VPN), `db push` will fail with `socket is not connected`. Fall back to pasting each migration into the Supabase Dashboard's **SQL Editor** in order, then keep the CLI's tracker in sync by inserting one row per migration into `supabase_migrations.schema_migrations`. Type generation uses the management API and works even when 5432 is blocked.
>
> If your network also intercepts TLS for outbound HTTPS (corporate root CA), the Node-based CLI needs `NODE_EXTRA_CA_CERTS=/path/to/corp-bundle.pem` and the Go-based CLI calls additionally need `SSL_CERT_FILE` set to the same bundle.

### Worker secrets

The deployed Cloudflare Worker reads `SUPABASE_URL` and `SUPABASE_KEY` (the **anon** public key) from Workers Secrets:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
```

The **service-role key is intentionally NOT used** anywhere in this project — server-side requests run under the user's JWT, so RLS policies enforce the per-user access boundary. Uploading the service-role key would create a path that bypasses RLS and weakens the data-isolation NFR.

### Money columns — string-at-runtime, use a decimal library

`gross_amount`, `units`, and `price` are `NUMERIC(20, 4)`. PostgREST may return them as JSON strings or numbers depending on version and value range — even when the generated `database.types.ts` annotates them as `number`, the actual runtime value can be a string. Tax calculations downstream of this slice (S-03) require exact arithmetic per the PRD NFR ("silent rounding errors are not acceptable"); use a decimal library (e.g. `decimal.js`, `big.js`) for any math on these columns, not native JavaScript `number` arithmetic.

## Importing transactions

Signed-in users land on `/setup` (linked from `/dashboard`) and upload an Allianz PPK transaction CSV (`Transaction_confirmation_*.csv`). The server parses the semicolon-delimited, Polish-decimal-comma file, filters out `Zamiana` (fund switches) and non-`Zrealizowane` rows, categorises each contribution as `own` / `employer` / `state` via a date-pair + amount-ratio heuristic, then upserts via the natural-key UNIQUE constraint — re-uploading the same file is a no-op.

The parser and categoriser are pure modules under `src/lib/allianz/`. A committed synthetic fixture lives at `tests/fixtures/allianz-sample.csv` (see the sibling `README.md`); run `npm run verify-parser` to exercise it.

**Heuristic caveat**: the categoriser assumes default PPK rates of employee 2% / employer 1.5%. If your rates differ, the per-source split shown in the post-import counts banner will be wrong — re-import after we add explicit rate config in a later slice.

## Pobieranie cen (fetching fund prices)

Signed-in users land on `/dashboard` and click **Pobierz cenę** to fetch the current unit price for fund `ALL88` (`Allianz Plan Emerytalny 2055`) from `https://www.analizy.pl/fundusze-ppk/ALL88/allianz-plan-emerytalny-2055`. The server fetches the page with an explicit `User-Agent` and an 8-second timeout, parses the visible unit-price node (`.productValueSumUp .productBigText`), and writes a row into `price_snapshots` under RLS — or skips the insert if the new price equals the latest stored one (dedup, signalled by `?dedup=1` and a "Cena bez zmian od ostatniego pobrania" note in the UI).

The fetch is **on-demand only** — there is no scheduled refresh, no background job, and no auto-fetch on dashboard load. A user with no snapshots sees the red "Pobierz cenę, aby zobaczyć wycenę portfela." banner and clicks the button.

Failures (network error, timeout, non-2xx, or selector miss) redirect to `/dashboard?priceError=<reason>`. A generic Polish banner ("Pobieranie nie powiodło się. Spróbuj ponownie.") is shown, with the raw error tucked inside a collapsible `<details>` "Szczegóły" element. If a prior snapshot exists, it is shown under an amber-bordered block with an explicit `Pobrano N dni/godz./min temu` age — honoring FR-007 (never display a stale price as current).

The parser is a pure module at `src/lib/analizy/parse.ts`. A committed fixture lives at `tests/fixtures/analizy-sample.html`; run `npm run verify-price-parser` to exercise the Polish-decimal-comma normalization and the fixture happy path against a recorded reference price.

**Single-fund approximation (MVP caveat)**: the dashboard valuation is computed as `SUM(transactions.units) × ALL88 unit price`. This is mathematically exact for users fully invested in a single fund (which matches the current user, who is fully switched out of `Allianz PPK 2055` into `Allianz Plan Emerytalny 2055`). For a user still split across multiple funds, the number would be inaccurate — a future slice would need to extend `transactions` with a per-row fund identifier and the price-fetch route with a per-ticker lookup. The PRD §Non-Goals explicitly defers multi-fund support to v2.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

1. Build the project:

```bash
npm run build
```

2. Deploy with Wrangler:

```bash
npx wrangler deploy
```

Set `SUPABASE_URL` and `SUPABASE_KEY` as secrets in your Cloudflare dashboard or via `npx wrangler secret put`.

## CI

GitHub Actions runs lint + build on every push and PR to `master`. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets in GitHub for the build step.

## License

MIT
