# Landing redirect + UI polish (typography, colour, icons) Implementation Plan

## Overview

Two concerns in one slice. (1) **Landing**: niezalogowany odwiedzający kreślony URL `https://real-value-portfolio-app.kamilczajka2.workers.dev/` ma trafiać od razu na `/auth/signin` (gdzie ląduje `AppIntro` panel z S-03 wyjaśniający produkt), zalogowany — od razu na `/dashboard`. Bieżący root renderuje starterowy `<Welcome>` z orbami i star-fieldem — out. (2) **Polish wizualny**: scenariusze na `/dashboard` nie różnicują się ani typograficznie, ani kolorystycznie (wszystko siedzi w jednym tonie `text-blue-100/70-80`); w `.astro` nie ma ikon, choć `lucide-react` już jest używany w React-island formularzach. Plan ma trzy osie:

- **Smart redirect** z `/` przez middleware (kontekst sesji już tam siedzi dla `PROTECTED_ROUTES`); kasacja `Welcome.astro` + `Topbar.astro`; `Layout.astro` startuje z `lang="pl"` i sensownym tytułem.
- **Icon strategy dla `.astro`**: `astro-icon` + `@iconify-json/lucide` (server-side inline SVG, 0 KB JS u klienta, ta sama paleta co `lucide-react` w formularzach — spójność).
- **Celebrate-the-value typography**: każda karta scenariusza dostaje ikonę + emphasis na wartości, którą produkt celebrate'uje (zysk na immediate/retirement, "dostępne od razu" na illness, "100% wartości do {date}" na housing). Strata pokazana spokojnie (małe + neutralne + subtelny czerwony akcent), nie krzyczy.

## Current State Analysis

- **`src/pages/index.astro:1-9`** importuje i renderuje `<Welcome />`. Ten plik to docelowy redirect.
- **`src/components/Welcome.astro:1-100+`** — starterowy "cosmic" hero z orbami + star-fieldem + `<Topbar>`. Do usunięcia.
- **`src/components/Topbar.astro`** — używany tylko z `Welcome`. Do usunięcia razem z `Welcome`.
- **`src/components/Banner.astro`** — **używany w `Layout.astro:24-37`** dla `missingConfigs.map`. **Zostaje** — to żywa funkcja runtime-check `.env`.
- **`src/middleware.ts:4`** — `PROTECTED_ROUTES = ["/dashboard", "/setup", "/api/prices", "/api/profile", "/api/transactions"]`. Już sprawdza sesję (`context.locals.user`); rozbudowa o `/` smart-redirect jest tańsza niż nowy middleware.
- **`src/layouts/Layout.astro:11-19`** — `lang="en"`, domyślny `title="10x Astro Starter"`. Trzeba ścisły `lang="pl"` + brand-aligned default ("Real Value PPK"). Favicon zostaje placeholder (defer do osobnego slice'u).
- **Lucide-react już jako dep** (`package.json` deps). Używany w `src/components/auth/SignInForm.tsx`, `SignUpForm`, `FormField`, `PasswordToggle`, `ServerError`, `setup/UploadForm.tsx`. **W plikach `.astro` ikon zero** — bo lucide-react wymaga React island (koszt: hydratacja JS). Dla `.astro` rozwiązanie: `astro-icon` + `@iconify-json/lucide` — ten sam set ikon (Iconify ma `lucide` jako oficjalny pack), renderowany jako inline SVG na serwerze, tree-shake do użytych ikon.
- **`global.css:1-40`** — shadcn-style CSS variables (oklch) zdefiniowane, ale **niepowiązane z Tailwindem** (brak `@theme` config). Tailwind v4 (`@tailwindcss/vite`). Token-driven design system byłby wartościowy, ale poza scope (decyzja: minimal touch, Tailwind utility classes).
- **`src/pages/dashboard.astro:178-258`** (po S-03 + impl-review) renderuje 4 karty scenariuszy. Aktualnie:
  - Nagłówek karty: `text-sm font-semibold text-blue-100/80` (mały, jeden ton).
  - Kwota: `text-2xl font-bold tabular-nums` (OK, ale można mocniej).
  - Availability label: `text-xs text-blue-100/70` — wszystkie cztery scenariusze mają ten sam ton; "dostępne od razu" (good news) nie różni się od "niedostępne".
  - Gain/loss positive: `text-xs text-green-200/80` — zysk traktowany jako kolejna linia tekstu, nie hero. To kontra do intencji "celebrate".
  - Gain/loss negative: `text-xs text-red-300/80` — drobny + czerwony, OK, choć "kontra" intencji "neutralnie, bez paniki".
  - Breakdown + `<details>`: niskokontrastowe, OK jak jest.
- **`src/components/auth/AppIntro.astro`** — 4 bullet-y opisujące scenariusze. Bez ikon.
- **`src/pages/setup.astro`** + **`src/pages/dashboard.astro`** mają button-y nawigacyjne bez ikon (Pobierz cenę, Importuj, Wyloguj, → Dashboard, Zapisz).

### Key Discoveries

- Lucide-react **już zainstalowany** — Iconify pack `@iconify-json/lucide` zawiera dokładnie te same SVG (ten sam fingerprint). Wybór `astro-icon` daje spójność z formularzami React bez kosztu hydratacji.
- Banner.astro **nie jest martwy** — Layout używa go dla missingConfigs. Pytanie do user-a w Round 2 implicit zakładało, że tylko Welcome + Topbar idą do usunięcia.
- Middleware **już ma sesję** — `context.locals.user` set przed routing. Smart-redirect na `/` to 5 linii, nie nowy plik.
- Layout.astro `<title>{title}</title>` istnieje, więc page-specific tytuły (`Dashboard`, `Konfiguracja`, `Sign in`) działają — wystarczy zmienić **default**.
- `src/styles/global.css` deklaruje tokens **ale Tailwind ich nie widzi** (brak `@theme` w v4). Wired-up design system pozostaje out of scope — używamy tokenów per-use (Tailwind utility kolory: green-400/red-300/etc.).

## Desired End State

Po landing-i-polish slice:

- **Wpisanie URL root** `/` przekierowuje:
  - bez sesji → 302 na `/auth/signin` (gdzie czeka `AppIntro` z opisem produktu + login form).
  - z sesją → 302 na `/dashboard` (od razu wycena).
- **Tab przeglądarki** pokazuje "Real Value PPK" (lub page-specific tytuł na konkretnych stronach); `<html lang="pl">` — a11y, SEO.
- **AppIntro** ma 4 lucide ikony przy bulletach scenariuszy (LogOut / Heart / Home / Hourglass), spójne z dashboardem.
- **Dashboard scenario cards**:
  - Każda karta ma ikonę scenariusza na nagłówku (LogOut / Heart / Home / Hourglass).
  - Kwota netto: większa, mocniejsza (text-3xl, bold).
  - **Immediate (zwrot)**: zysk gdy positive — `text-2xl font-bold text-emerald-300`, prominent (dzisiaj `text-xs`); strata — `text-xs text-rose-200/70` mała neutralna (dzisiaj `text-xs text-red-300/80` — łagodzimy).
  - **Illness**: "Dostępne od razu" — duża zielona linia (`text-base font-semibold text-emerald-300`), nie tekst pomocniczy.
  - **Housing**: "Dostępne do {date} ({X} lat)" + "100% wartości portfela" — łączenie w jedną zielono-happy informację ("Możesz pożyczyć **{amount}** za 0% do **{date}** — masz jeszcze **{X} lat** prawa"), bold, zielona, prominent.
  - **Retirement**: zysk happy traktowany jak immediate — duża zielona kwota gdy positive.
- **Setup page** + **Dashboard buttons** mają ikony nawigacyjne (Pobierz cenę → RefreshCw, Importuj → Upload, Wyloguj → LogOut, → Dashboard → Home, Zapisz → Save). Setup sekcje (Data urodzenia, Twoje wpłaty) mają ikony na headerach.
- **`Welcome.astro` + `Topbar.astro` skasowane**; `index.astro` to 6-linijkowy redirect; nikt nie ma już dezorientacji "po co jest ta starterowa strona z orbami".

## What We're NOT Doing

- **Brak design-system tokenizacji** — nie wiążemy `global.css` tokenów z Tailwindem. To osobny, większy slice.
- **Brak dark/light toggle** — zostajemy przy dark-only (cosmic gradient w tle).
- **Brak custom favicon** — placeholder zostaje, custom favicon = osobny mały slice.
- **Brak prawdziwego marketing landing page pod `/`** — redirect jest świadomą decyzją; landing pojawi się dopiero gdy będziemy mieć prawdziwy materiał marketingowy.
- **Brak modyfikacji formularzy auth (SignInForm, SignUpForm)** — mają już dobre lucide ikony przy polach (Mail/Lock/LogIn). Zostają.
- **Brak modyfikacji `UploadForm.tsx`** — ma już `Upload` ikonę.
- **Brak refactor Banner.astro** — funkcjonalny komponent, zostaje.
- **Brak status `200` z `/` z meta-refresh, no-script fallback itp.** — middleware 302 na warstwie SSR, koniec; Workers SSR jest bardzo szybki, brak realnego scenariusza no-JS-fallback.
- **Brak rewrite Polish copy w UploadForm/SignInForm/SignUpForm** — to bag-side. Jeśli pojawiają się tam stringi en-only — TODO osobny slice (już zostawione `Sign in` → `Zaloguj się` zrobione w S-03 impl-review).

## Implementation Approach

Cztery fazy w kolejności wzrostu ryzyka i widoczności:

1. **Sprzątanie + Layout + redirect z `/`** — czysto strukturalne, niewidoczne stylistycznie ale natychmiast realizuje główną prośbę usera (root → signin).
2. **Setup astro-icon + ikony w AppIntro** — instaluje bibliotekę i pierwsze użycie (AppIntro, mały surface), żeby zweryfikować że `astro-icon` działa pod Cloudflare Workers SSR przed dodaniem ikon w 20 miejscach.
3. **Dashboard cards — celebrate-the-value typography + per-scenario ikony** — serce produktu. Każda karta dostaje ikonę + przeprojektowaną hierarchię tekstową.
4. **Setup + nav-buttons + status-banner ikony** — wykończenie reszty surface'ów.

Każda faza jest niezależnie shippable: po Phase 1 user widzi efekt jednej prośby ("root redirect"); po Phase 3 widzi efekt drugiej ("ładniejsze karty"); Phase 2 i 4 to plumbing/dopełnienie.

## Critical Implementation Details

- **Astro-icon vs lucide-react**: dla `.astro` (server-side) używamy `astro-icon`. Dla istniejących `.tsx` (React island) **nie ruszamy** — lucide-react zostaje. Ikona "LogOut" w obu bibliotekach to ten sam SVG (Iconify pack `lucide` = port lucide-react do Iconify). Wizualnie 1:1.
- **Middleware redirect ordering**: w `src/middleware.ts` user session jest setowana ZANIM sprawdzane są `PROTECTED_ROUTES`. Smart-redirect na `/` musi sit AFTER session set i BEFORE `next()` — tak żeby decyzja "→ /dashboard vs /auth/signin" znała sesję. Ten porządek już istnieje; nowa logika to po prostu dodatkowy `if` w `onRequest`.
- **`index.astro` może być pustym redirect-em ALBO usunięte** — jeśli middleware łapie `/`, plik staje się redundantny. Decyzja: zostawić plik z `Astro.redirect()` jako defense-in-depth (gdyby middleware kiedyś zostało wyłączone, page-level redirect dalej działa). Sześć linii.

---

## Phase 1: Sprzątanie + Layout + redirect z `/`

### Overview

Usuń starterowy `<Welcome>` + `<Topbar>`, zamień root page na smart-redirect (middleware sets session → root sprawdza `context.locals.user` → 302 na `/dashboard` albo `/auth/signin`), popraw Layout.astro defaults (`lang="pl"`, `title="Real Value PPK"`).

### Changes Required:

#### 1. Smart-redirect w middleware

**File**: `src/middleware.ts`

**Intent**: Po setowaniu sesji, jeśli żądanie idzie na dokładnie `/`, zwróć 302 na odpowiednie miejsce — niezależnie od istnienia `index.astro`. Tańsze niż routing przez Astro page.

**Contract**: W `onRequest`, po linii `context.locals.user = user ?? null;` (lub `null` w else), dodaj sprawdzenie `if (context.url.pathname === "/")` → `return context.redirect(context.locals.user ? "/dashboard" : "/auth/signin", 302);`. Wszystko inne (PROTECTED_ROUTES check + next()) bez zmian.

#### 2. `index.astro` jako defense-in-depth redirect

**File**: `src/pages/index.astro`

**Intent**: Gdyby middleware kiedyś nie zadziałał, plik-strona też ma robić redirect (a nie renderować Welcome).

**Contract**: `---` block: `export const prerender = false;` + `return Astro.redirect(Astro.locals.user ? "/dashboard" : "/auth/signin", 302);`. Plik bez body (`<Layout>` nie renderowany, response 302 zwracane przed).

#### 3. Skasowanie starterowych komponentów

**File**: `src/components/Welcome.astro` (usuń); `src/components/Topbar.astro` (usuń)

**Intent**: Dead code po przeniesieniu `/` na redirect.

**Contract**: `rm src/components/Welcome.astro src/components/Topbar.astro`. Brak referencji w innych plikach (sprawdzić `grep -rn "Welcome\|Topbar" src/` — jeśli coś inne niż index.astro je importuje, decyzja PRZED usunięciem).

#### 4. Layout.astro polish

**File**: `src/layouts/Layout.astro`

**Intent**: `lang="en"` → `lang="pl"` (a11y + SEO); default `title="10x Astro Starter"` → `title="Real Value PPK"`. Reszta layoutu (Banner z missingConfigs, slot, style) bez zmian.

**Contract**: Linia 13: `<html lang="en">` → `<html lang="pl">`. Linia 8 (lub gdzie default): `title = "10x Astro Starter"` → `title = "Real Value PPK"`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` clean
- `npm run build` green
- `grep -rn "Welcome\|Topbar" src/` zwraca zero matches (poza `node_modules`)
- `grep -n 'lang="en"' src/layouts/Layout.astro` zwraca zero matches
- `grep -n "10x Astro Starter" src/layouts/Layout.astro` zwraca zero matches

#### Manual Verification:

- Sign out → otwórz `/` w przeglądarce → URL bar pokazuje `/auth/signin`, formularz widoczny + AppIntro u góry.
- Sign in → otwórz `/` w przeglądarce → URL bar pokazuje `/dashboard`, wycena widoczna.
- Tab przeglądarki na `/auth/signin` pokazuje "Zaloguj się"; na `/dashboard` "Dashboard"; otwierając bez page-specific title default to "Real Value PPK".
- Screen reader / DevTools → `<html lang="pl">`.

**Implementation Note**: Po Phase 1 pauza dla manual verification. Phase 2 nie zależy strukturalnie od Phase 1 ale ma sens chronologicznie.

---

## Phase 2: Setup astro-icon + ikony w AppIntro

### Overview

Zainstaluj `astro-icon` + `@iconify-json/lucide` jako dev dependencies, dodaj integration do `astro.config.mjs`, użyj pierwszego setu ikon w `AppIntro.astro` (4 ikony przy bulletach scenariuszy) jako smoke-test biblioteki przed masowym użyciem w Phase 3.

### Changes Required:

#### 1. Install astro-icon + lucide pack

**File**: `package.json`

**Intent**: Dependencies dla server-side SVG rendering.

**Contract**: `npm install astro-icon @iconify-json/lucide` (dev — bo build-time-only). Po instalacji obie wpisy w `devDependencies`.

#### 2. Konfiguracja astro-icon

**File**: `astro.config.mjs`

**Intent**: Wired-up integration tak, żeby `<Icon name="lucide:..." />` działało w każdym `.astro` pliku.

**Contract**: Dodaj `import icon from "astro-icon";` na górze i `icon()` w `integrations: [...]`. Bez dodatkowego config-a — domyślnie astro-icon resoluje `@iconify-json/<pack>` automatycznie.

#### 3. AppIntro ikony przy bulletach

**File**: `src/components/auth/AppIntro.astro`

**Intent**: Każdy z 4 bulletów (immediate / illness / housing / retirement) dostaje małą lucide ikonę przed tekstem. Ikony spójne z dashboard cards (Phase 3 użyje tych samych: LogOut, Heart, Home, Hourglass).

**Contract**: `import { Icon } from "astro-icon/components";` w frontmatter. Zmiana `<ul>...<li>...</li>...</ul>` na list-y bez `list-disc` (zastępujemy ikoną): `<li class="flex items-start gap-2"><Icon name="lucide:log-out" class="mt-0.5 h-3.5 w-3.5 flex-none" />Tekst bullet-a</li>`. Mapping:
- Zamknięcie konta (zwrot) → `lucide:log-out`
- Wypłata 25% (poważne zachorowanie) → `lucide:heart-pulse` (lepsze niż `heart` — sygnalizuje medyczne, nie ❤️)
- Pożyczka 100% (cele mieszkaniowe) → `lucide:home`
- Wypłata po 60+ → `lucide:hourglass`

### Success Criteria:

#### Automated Verification:

- `npm run build` green (astro-icon build-time SVG generation działa)
- `npm run lint` clean
- W zbudowanym output (`dist/`) bundle dla `/auth/signin` zawiera inline SVG `<svg>` z lucide path-em (nie JS hydratacji)

#### Manual Verification:

- Otwórz `/auth/signin` w przeglądarce → 4 bullet-y w AppIntro mają ikony po lewej; ikony są szare/jasnoniebieskie, spójne z text-color (`text-blue-100/70`); rozmiar ~14px; brak skoku layoutu przy ładowaniu (SSR-rendered, nie JS).
- DevTools → Network → brak nowych JS requestów dla ikon; SVG inline w HTML.
- To samo na `/auth/signup`.

**Implementation Note**: Po Phase 2 pauza dla manual verification — jeśli astro-icon nie buduje pod Cloudflare Workers (rzadkie, ale możliwe — astro-icon używa `node:fs` w build-time, runtime Workers go nie potrzebuje), fallback na inline SVG ad-hoc. Smoke-test 4 ikon w AppIntro to ten gate.

---

## Phase 3: Dashboard cards — celebrate-the-value typography + per-scenario ikony

### Overview

Każda z 4 kart scenariuszy na `/dashboard` dostaje (a) ikonę scenariusza na nagłówku, (b) przeprojektowaną hierarchię typograficzną z naciskiem na wartość-do-celebrowania. Strata (negative gain) traktowana spokojnie — mała, neutralna, subtelny czerwony.

### Changes Required:

#### 1. Per-scenario ikony i emphasis labels w SCENARIO_LABELS

**File**: `src/pages/dashboard.astro` (frontmatter section, ~linia 95-130)

**Intent**: Wzbogać metadane scenariuszy o ikonę. Trzymamy istniejące `SCENARIO_LABELS` + `SCENARIO_EXPLANATIONS`; dodajemy `SCENARIO_ICONS`.

**Contract**: Nowy `const SCENARIO_ICONS: Record<ScenarioId, string> = { immediate: "lucide:log-out", illness: "lucide:heart-pulse", housing: "lucide:home", retirement: "lucide:hourglass" };`. Import: `import { Icon } from "astro-icon/components";` w istniejącym imports block.

#### 2. Card heading z ikoną

**File**: `src/pages/dashboard.astro` (template section, w `<article>` per scenariusz)

**Intent**: Header karty: ikona + label scenariusza w jednym flex-row, ikona większa niż w AppIntro (`h-5 w-5`), z accent kolorem (`text-blue-200`).

**Contract**: `<h2 class="text-sm font-semibold text-blue-100/80">{label}</h2>` → `<div class="flex items-center gap-2"><Icon name={SCENARIO_ICONS[scenario.id]} class="h-5 w-5 text-blue-200/90 flex-none" /><h2 class="text-sm font-semibold text-blue-100/80">{label}</h2></div>`.

#### 3. Kwota netto — większa

**File**: `src/pages/dashboard.astro` (template, "Amount" line)

**Intent**: Z `text-2xl font-bold` na `text-3xl font-bold tracking-tight` — wyraźniejszy hero karty.

**Contract**: Linia z `{currencyFmt.format(scenario.netAmount)}` — zmiana klas `class="mt-2 text-2xl font-bold tabular-nums"` na `class="mt-2 text-3xl font-bold tabular-nums tracking-tight"`.

#### 4. Availability label — happy emphasis per scenariusz

**File**: `src/pages/dashboard.astro` (template, availability conditional)

**Intent**: "Dostępne od razu" + housing "Dostępne do" + retirement "Dostępne od razu / N lat temu" — gdy positive news (available now, lub time-bounded right) — większy, zielony. "Niedostępne" + retirement-future — pozostają drobne i neutralne.

**Contract**:
- `avail?.available && avail.availableUntil !== null` (housing, ma jeszcze prawo): zmiana z `text-xs text-blue-100/70` na `text-base font-semibold text-emerald-300` + dodanie celebrate-frazy: `Dostępne do {date} — masz jeszcze {N} lat na bezprocentową pożyczkę`.
- `avail?.available && availableUntil === null && availableFrom === null` (immediate / illness, zawsze dostępne): zmiana z `text-xs text-blue-100/70` na `text-base font-semibold text-emerald-300` (`Dostępne od razu`).
- `!avail.available && availableFrom !== null` (retirement, jeszcze nie wiek): pozostaje `text-xs text-blue-100/70` (`Dostępne od {date} (za N lat)`) — neutralna informacja, nie celebrate.
- `!avail.available && availableUntil !== null` (housing, po 45-tce): pozostaje drobne (`text-xs text-blue-100/60` — bardziej wygaszone, "to już prawo utracone").
- `birthDate === null`: bez zmian (yellow hint).

#### 5. Gain/loss line — celebrate positive, hush negative

**File**: `src/pages/dashboard.astro` (template, gain/loss conditional)

**Intent**: Positive zysk → duża zielona linia (jak "Dostępne od razu" — text-base + bold + emerald-300); negative strata → mała, neutralna szara z subtelnym czerwonym akcentem (text-xs + text-rose-200/60, no scary red).

**Contract**:
- Positive branch: `class="mt-1 text-xs text-green-200/80 tabular-nums"` → `class="mt-2 text-base font-semibold text-emerald-300 tabular-nums"`; treść bez zmian (`+ {amount} ({pct}%) zysk vs. własny kapitał`).
- Negative branch: `class="mt-1 text-xs text-red-300/80 tabular-nums"` → `class="mt-1 text-xs text-rose-200/60 tabular-nums"`; treść bez zmian.
- "brak własnych wpłat" branch: bez zmian.

#### 6. Breakdown + `<details>` — bez zmian

**Intent**: Niskokontrastowa metadata i collapsible — działa, nie celebrate'ujemy implementation detail.

**Contract**: Pomijamy.

### Success Criteria:

#### Automated Verification:

- `npm run verify-scenarios` still passes (regression — typografia nie tyka helper-ów)
- `npm run verify-valuation` still passes
- `npm run lint` clean
- `npm run build` green
- W zbudowanym HTML `/dashboard` (przy zalogowanym test-user-ze) każda karta ma `<svg>` ikonę przed `<h2>` — `grep "lucide" dist/_worker.js/index.js` lub inspekcja SSR

#### Manual Verification:

- `/dashboard` z imported transactions + price + birth date: każda z 4 kart pokazuje ikonę (LogOut/HeartPulse/Home/Hourglass) na nagłówku.
- Kwota netto wyraźniejsza — większa niż dziś, jeszcze bardziej hero.
- Immediate przy zysku: linia "+ 12 345,67 zł (8,2%) zysk vs. własny kapitał" jest duża, zielona, prominent (nie jak drobna stopka).
- Illness: "Dostępne od razu" duże, zielone — happy.
- Housing (user <45): "Dostępne do {data} — masz jeszcze {N} lat na bezprocentową pożyczkę" — duże, zielone.
- Housing (user >45): "Niedostępne (po {data})" — drobne, wygaszone.
- Retirement (user >60): zysk duży, zielony; availability label "Dostępne od razu" zielone duże.
- Retirement (user <60): "Dostępne od {data} (za N lat)" — neutralne, drobne (informacja, nie celebrate).
- Wymuś stratę (np. test-user z transakcjami i obniżoną ceną) na immediate / retirement: linia straty drobna, ciemno-różowa, NIE krzyczy.

**Implementation Note**: Pauza dla manual verification — to serce zmiany. Jeśli któraś emphasis-linia źle wygląda (np. zielone "masz jeszcze N lat" w pełni dostępne dla 18-latka czyta się jak marketing) — zwęź copy w follow-up.

---

## Phase 4: Setup + nav-buttons + status-banner ikony

### Overview

Wykończenie pozostałych powierzchni: ikony nawigacji na `/dashboard` (button-y), ikony sekcji na `/setup`, opcjonalne ikony statusów (success/warning/error) w bannerach.

### Changes Required:

#### 1. Dashboard nav-buttons z ikonami

**File**: `src/pages/dashboard.astro` (button row, ~linia 305-)

**Intent**: Każdy button + link nawigacyjny dostaje lucide ikonę przed labelem.

**Contract**: Import `Icon` (jeśli jeszcze nie z Phase 3). Mapping:
- "Pobierz cenę" button → `<Icon name="lucide:refresh-cw" class="mr-1.5 inline h-4 w-4" /> Pobierz cenę`
- "Importuj plik transakcji" link → `lucide:upload`
- "Wyloguj się" button → `lucide:log-out`
- (Jeśli istnieje "→ Dashboard" link gdzieś w dashboard, pomiń — to setup-side)

Klasy ikon: `mr-1.5 inline h-4 w-4` — `mr-1.5` daje oddech, `inline` żeby tekstowo flow-owało, `h-4 w-4` jednolite z text-sm height.

#### 2. Setup nav + button ikony

**File**: `src/pages/setup.astro`

**Intent**: "→ Dashboard" link header → ikona `home`; "Zapisz" button (przy dacie urodzenia) → ikona `save`; "Przejdź do Dashboard →" CTA w import-success → `arrow-right`.

**Contract**:
- Header link: `<Icon name="lucide:home" class="mr-1 inline h-3.5 w-3.5" /> Dashboard` (zostawić strzałkę → albo ją usunąć — ikona ją zastępuje; preferowane: usunąć strzałkę).
- Zapisz button: `<Icon name="lucide:save" class="mr-1.5 inline h-4 w-4" /> Zapisz`.
- "Przejdź do Dashboard" CTA: ikona `lucide:arrow-right` na końcu zamiast Unicode →.

#### 3. Setup sekcje — ikony przy nagłówkach

**File**: `src/pages/setup.astro`

**Intent**: H2 sekcji (Twoje wpłaty, Data urodzenia) dostają małą lucide ikonę przed tekstem.

**Contract**: `<h2 class="...">Twoje wpłaty</h2>` → `<h2 class="... flex items-center gap-2"><Icon name="lucide:piggy-bank" class="h-4 w-4" /> Twoje wpłaty</h2>`. Dla Data urodzenia: `lucide:calendar`.

#### 4. (Opcjonalne) Status banner ikony

**File**: `src/pages/setup.astro` + `src/pages/dashboard.astro` (banner blocks)

**Intent**: success banner → CheckCircle2; error → AlertCircle; warning (dbError, priceError) → AlertTriangle; info — bez ikony. Wewnątrz banner-a, ikona po lewej stronie tekstu.

**Contract**: Optional — jeśli czas pozwoli, dodać ikonę `CheckCircle2` (lucide) do greenowych banner-ów ("Zapisano datę urodzenia.", "Zaimportowano N nowych...") i `AlertCircle` do czerwonych ("Nie zapisano: ...", "Błąd bazy danych: ..."). Wzorzec: `<div class="... flex items-start gap-3"><Icon name="lucide:check-circle-2" class="h-5 w-5 flex-none mt-0.5" /><div>{tekst banner-a}</div></div>`. Jeśli zostanie czas, zrobić; w przeciwnym razie defer.

### Success Criteria:

#### Automated Verification:

- `npm run lint` clean
- `npm run build` green
- `grep -n "lucide:" src/pages/dashboard.astro src/pages/setup.astro` zwraca matches w obu plikach

#### Manual Verification:

- `/dashboard`: trzy button-y mają widoczne ikony (RefreshCw / Upload / LogOut), spójny rozmiar 16px, oddech `mr-1.5`.
- `/setup`: "Dashboard" link w header z ikoną Home; "Zapisz" button z ikoną Save; "Przejdź do Dashboard" CTA z ikoną ArrowRight; H2 sekcji "Twoje wpłaty" z PiggyBank, "Data urodzenia" z Calendar.
- (Jeśli zrobione) Banner-y success mają zieloną CheckCircle2, error-y czerwoną AlertCircle.
- Click każdy nawigacyjny button — funkcjonalność bez zmian (ikona to dekoracja, nie nowa logika).

**Implementation Note**: Pauza dla manual verification. Po Phase 4 cały slice ukończony — całość ma być widoczna stylistycznie spójna z 4 fazami za sobą.

---

## Testing Strategy

### Unit-level (verify scripts)

Bez nowych verify scripts — zmiany są UI-only, nie tykają helper-ów. Regresja: `npm run verify-scenarios`, `npm run verify-valuation`, `npm run verify-parser`, `npm run verify-price-parser` — wszystkie muszą pozostać zielone po każdej fazie.

### Integration (manual via browser)

- Root redirect dla zalogowanego + niezalogowanego.
- Wszystkie 4 stany scenario cards × birth-date present/absent × pod/po 45/60.
- Force loss state (test-user z niską ceną) — sprawdź że strata wygląda spokojnie, nie histerycznie.
- Sprawdź `/setup` flow end-to-end z nowymi ikonami: load, save birth date, import CSV, click "Przejdź do Dashboard".

### Visual regression

Brak Chromatic/Percy w projekcie. Visual diff manualny przed/po każdej fazie — screenshot kluczowych ekranów (signin, dashboard, setup).

## Performance Considerations

- **Astro-icon**: SVG-y są inline'owane w build-time. Tree-shake — tylko użyte ikony lądują w buildzie. Per-ikona overhead ~200-400 bajtów HTML. Z ~12 unikalnymi ikonami w całym slice'ie: ~3-5 KB HTML extra na stronę. Cloudflare gzip → ~1-2 KB transfer.
- **Brak nowych queries / I/O**: zmiana wizualna, nie funkcjonalna.
- **CPU budget**: bez zmian — helper-y scenariuszy bez modyfikacji.

## Migration Notes

- Brak migracji bazy.
- Brak nowych zmiennych środowiskowych.
- Po Phase 1: jeśli ktoś bookmarkował `/` jako swój punkt wejścia, dalej działa — 302 redirect transparent.
- Welcome/Topbar/Banner.astro: tylko `Welcome` + `Topbar` usunięte; `Banner.astro` zostaje (Layout go używa).

## References

- Change: `context/changes/landing-redirect-and-ui-polish/change.md`
- Sibling change S-03 (auth + dashboard cards baseline): `context/archive/2026-06-25-withdrawal-scenarios-dashboard/plan.md`
- Sibling change S-02 (dashboard valuation block): `context/archive/2026-06-25-fetch-fund-price/plan.md`
- Lucide icon set: `https://lucide.dev/icons/` (Iconify mirror: `https://icon-sets.iconify.design/lucide/`)
- Astro-icon docs: `https://github.com/natemoo-re/astro-icon`
- Lessons: `context/foundation/lessons.md` — nie dotyczą UI, ale zostają jako prior dla wszystkich przyszłych zmian.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Sprzątanie + Layout + redirect z `/`

#### Automated

- [x] 1.1 `npm run lint` clean — 7441d9e
- [x] 1.2 `npm run build` green — 7441d9e
- [x] 1.3 `grep -rn "Welcome\|Topbar" src/` zwraca zero matches — 7441d9e
- [x] 1.4 `grep -n 'lang="en"' src/layouts/Layout.astro` zwraca zero matches — 7441d9e
- [x] 1.5 `grep -n "10x Astro Starter" src/layouts/Layout.astro` zwraca zero matches — 7441d9e

#### Manual

- [ ] 1.6 Sign out → `/` redirectuje na `/auth/signin` (URL bar)
- [ ] 1.7 Sign in → `/` redirectuje na `/dashboard` (URL bar)
- [ ] 1.8 Tab title default to "Real Value PPK"; `<html lang="pl">` w DevTools

### Phase 2: Setup astro-icon + ikony w AppIntro

#### Automated

- [x] 2.1 `npm run build` green (astro-icon buduje pod Cloudflare adapter)
- [x] 2.2 `npm run lint` clean
- [x] 2.3 W zbudowanym HTML `/auth/signin` widać inline SVG przy bulletach AppIntro

#### Manual

- [ ] 2.4 `/auth/signin` ma 4 ikony przy bulletach AppIntro (LogOut, HeartPulse, Home, Hourglass)
- [ ] 2.5 `/auth/signup` — to samo
- [ ] 2.6 DevTools → Network: brak nowych JS requestów dla ikon

### Phase 3: Dashboard cards — celebrate-the-value typography + per-scenario ikony

#### Automated

- [ ] 3.1 `npm run verify-scenarios` still passes (regression guard)
- [ ] 3.2 `npm run verify-valuation` still passes (regression guard)
- [ ] 3.3 `npm run lint` clean
- [ ] 3.4 `npm run build` green

#### Manual

- [ ] 3.5 Każda z 4 kart na `/dashboard` ma swoją ikonę na nagłówku (LogOut/HeartPulse/Home/Hourglass)
- [ ] 3.6 Kwota netto większa niż przed (`text-3xl`)
- [ ] 3.7 Immediate przy positive gain: zielona, duża linia "+ N zł (X%) zysk vs. własny kapitał"
- [ ] 3.8 Illness: "Dostępne od razu" duże, zielone
- [ ] 3.9 Housing user <45: "Dostępne do {data} — masz jeszcze {N} lat na bezprocentową pożyczkę" duże, zielone
- [ ] 3.10 Housing user >45: "Niedostępne (po {data})" drobne, wygaszone
- [ ] 3.11 Retirement user >60: zysk duży zielony; "Dostępne od razu" duże zielone
- [ ] 3.12 Retirement user <60: "Dostępne od {data} (za N lat)" drobne, neutralne
- [ ] 3.13 Force loss state na immediate/retirement: strata drobna, rose-200, nie krzyczy

### Phase 4: Setup + nav-buttons + status-banner ikony

#### Automated

- [ ] 4.1 `npm run lint` clean
- [ ] 4.2 `npm run build` green
- [ ] 4.3 `grep -n "lucide:" src/pages/dashboard.astro src/pages/setup.astro` matches w obu plikach

#### Manual

- [ ] 4.4 Dashboard button-y "Pobierz cenę"/"Importuj"/"Wyloguj się" mają ikony
- [ ] 4.5 Setup "→ Dashboard" link z ikoną Home; "Zapisz" z ikoną Save; "Przejdź do Dashboard" CTA z ArrowRight
- [ ] 4.6 Setup H2 sekcji "Twoje wpłaty" z PiggyBank, "Data urodzenia" z Calendar
- [ ] 4.7 (Opcjonalne) Banner-y success/error mają CheckCircle2/AlertCircle
- [ ] 4.8 Wszystkie button-y działają (funkcjonalność niezmienione)
