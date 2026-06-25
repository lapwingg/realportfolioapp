# Landing redirect + UI polish — Plan Brief

> Full plan: `context/changes/landing-redirect-and-ui-polish/plan.md`

## What & Why

Niezalogowany odwiedzający root URL (`/`) ma trafiać od razu na `/auth/signin` (gdzie ląduje już AppIntro panel z S-03 wyjaśniający produkt); zalogowany — na `/dashboard`. Po drugie, wizualnie: scenariusze na `/dashboard` celebrate'ują wartość-do-pochwalenia (zysk większy/zielony na immediate i retirement, "Dostępne od razu" duże zielone na illness, "Możesz pożyczyć 100% do {date}" happy zielony na housing), zamiast siedzieć w jednym tonie `text-blue-100/70`. Ikony dochodzą tam gdzie ich dziś nie ma (pliki `.astro`) przez `astro-icon` + `@iconify-json/lucide` — paleta lucide spójna z formularzami auth, server-side SVG, 0 KB JS u klienta.

## Starting Point

`src/pages/index.astro` renderuje starterowy `<Welcome>` (cosmic orby + star field + Topbar) — out. `src/middleware.ts` już seto wuje `context.locals.user` przed routing — smart-redirect to dodatkowy `if` w `onRequest`. `src/layouts/Layout.astro` ma `lang="en"` i default `title="10x Astro Starter"` (starterowe ślady). Lucide-react jest dependency i używany w `SignInForm`/`SignUpForm`/`UploadForm` — ale `.astro` nie mają ikon. `global.css` deklaruje shadcn-style oklch tokens, ale nie są wired do Tailwinda (`@theme` nie istnieje). Dashboard scenario cards z S-03 są strukturalnie OK, tylko typograficznie wszystkie cztery sekcje wyglądają tak samo.

## Desired End State

Bookmark / wpis `/` przekierowuje natychmiast (302) na sensowne miejsce zależnie od sesji. Karty scenariuszy na `/dashboard` mają ikonę po lewej nagłówka, większą kwotę netto (text-3xl), i jedną wyróżnioną "happy" linię per scenariusz: immediate/retirement → zysk gdy positive (zielona, prominent); illness → "Dostępne od razu" zielona-duża; housing user-pre-45 → "Dostępne do {date} — masz jeszcze {N} lat na bezprocentową pożyczkę" zielona-duża. Strata pokazana spokojnie, nie krzyczy. AppIntro na auth pages ma 4 lucide ikony przy bulletach scenariuszy. Setup-side: ikony na navigation buttons + section headers. `Welcome.astro` + `Topbar.astro` usunięte. `Layout.astro` z `lang="pl"` i tytułem "Real Value PPK".

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Redirect mechanism z `/` | Middleware smart-redirect (session-aware): zalogowany→/dashboard, niezalogowany→/auth/signin | Tańsze niż nowy plik; middleware już ma sesję | Plan |
| Icon library dla `.astro` | astro-icon + @iconify-json/lucide | Server-side SVG (0 KB JS u klienta), spójna paleta z lucide-react w formularzach, tree-shake | Plan |
| Scope kolorystyczny | Celebrate-the-value per scenariusz (nie design-system overhaul) | User-centric: kwota i "available" jako hero karty; strata neutralna; produktowe "happy" sygnały | Plan |
| Sprzątanie | Usuń Welcome.astro + Topbar.astro; Banner.astro zostaje (Layout go używa) | Banner ma żywą funkcję (missingConfigs runtime-check), reszta to dead starter code | Plan |
| Layout polish | lang="pl" + default title "Real Value PPK", favicon defer | Trzy linijki, duży zysk a11y/SEO; favicon to osobny slice (design needed) | Plan |
| AppIntro ikony | LogOut / HeartPulse / Home / Hourglass przy bulletach | Spójność z dashboardem (te same 4 ikony per scenario w Phase 3) | Plan |
| Loss state na cards | Mała, neutralna, subtelny czerwony (rose-200/60), bez panikującej czerwieni | App ma być "realny", nie żałobny; intencja "celebrate gdy jest co, pokaż prawdę gdy nie ma" bez moralizowania | Plan |

## Scope

**In scope:**

- Smart-redirect z `/` na podstawie sesji (middleware + `index.astro` defense-in-depth)
- Layout.astro polish: `lang="pl"`, default title
- Usunięcie `Welcome.astro` + `Topbar.astro`
- Instalacja `astro-icon` + `@iconify-json/lucide`
- Ikony w `AppIntro.astro` (4 scenariusze)
- Dashboard scenario cards: per-scenario ikony, większa kwota, celebrate-the-value typografia
- Dashboard nav buttons + Setup page: ikony nawigacji + ikony sekcji
- Opcjonalnie: ikony statusów w bannerach

**Out of scope:**

- Pełen design system z `@theme` tokenami (osobny slice)
- Dark/light mode toggle (dark only)
- Custom favicon (osobny slice)
- Prawdziwa marketing landing page pod `/` (redirect jest świadomą decyzją)
- Modyfikacje istniejących formularzy auth/upload (mają już lucide)
- Bag-side Polish translations (TODO osobny slice)

## Architecture / Approach

Cztery niezależne fazy w kolejności od strukturalnej do kosmetycznej:

1. **Phase 1** — redirect + sprzątanie + Layout (3 pliki, no design impact)
2. **Phase 2** — icon library setup + smoke-test w AppIntro (1 dep + 1 config + 1 plik)
3. **Phase 3** — dashboard cards: ikony + celebrate-the-value typography (1 duży plik)
4. **Phase 4** — nav-buttons + setup sections + opcjonalnie banner ikony (2-3 pliki)

Każda faza shipowalna osobno; Phase 2 to gate dla astro-icon (jeśli nie buduje pod Cloudflare Workers — rzadkie — fallback na inline SVG ad-hoc).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Sprzątanie + Layout + redirect z `/` | Root URL od razu redirectuje; lang/title czyste | Middleware ordering — sesja musi być set przed `/` check |
| 2. Icon library + AppIntro icons | Astro-icon + 4 ikony w AppIntro | Astro-icon pod Cloudflare Workers SSR — smoke-test |
| 3. Dashboard cards celebrate typography + icons | Karty wyraźnie różnicują wartości; ikony per scenario | Subiektywność "happy" copy — może trzeba zwęzić frazy |
| 4. Setup + nav + banner ikony | Wykończenie pozostałych powierzchni | Niskie — kosmetyka, no logic changes |

**Prerequisites:** S-03 (withdrawal-scenarios-dashboard) wdrożone — Phase 3 modyfikuje karty zbudowane w S-03; AppIntro też z S-03. Wszystko już zarchiwizowane.

**Estimated effort:** ~1-2 sesje po 4 fazach. Phase 1 + 2 + 4 — szybkie (każda ~30-60 min). Phase 3 — najdłuższa (1-2h) bo dużo iteracji per karta.

## Open Risks & Assumptions

- **Astro-icon pod Cloudflare Workers**: oficjalne wsparcie, ale projekt jest na `@astrojs/cloudflare`; nieprzewidziane edge case'y mogą wystąpić przy SSR. Phase 2 to bramka; fallback inline SVG.
- **"Happy" copy na housing** ("masz jeszcze {N} lat na bezprocentową pożyczkę") może czytać się marketingowo dla wybranych użytkowników; gotowe na revisit po Phase 3 feedback.
- **Loss state** — neutralny może wyglądać "obojętnie"; jeśli user-feedback woła o silniejsze ostrzeżenie, podbijemy w follow-up.

## Success Criteria (Summary)

- Wpisanie `/` w przeglądarce momentalnie ląduje na właściwej stronie (`/dashboard` zalogowany; `/auth/signin` nie).
- Dashboard scenario cards mają widoczną hierarchię: kwota i "happy news" wyróżnione, ikony per scenario rozpoznawalne na pierwszy rzut oka.
- Auth pages (`/auth/signin`, `/auth/signup`) mają ikony przy bulletach scenariuszy w AppIntro.
- `npm run verify-scenarios`, `verify-valuation`, `lint`, `build` — wszystkie zielone po każdej fazie (regresja-net).
