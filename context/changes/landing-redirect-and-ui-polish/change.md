---
change_id: landing-redirect-and-ui-polish
title: Redirect / to /auth/signin and polish UI typography, colour, and icons
status: implementing
created: 2026-06-25
updated: 2026-06-25
archived_at: null
---

## Notes

Aktualny root `https://real-value-portfolio-app.kamilczajka2.workers.dev/` nie jest pożądaną stroną startową — odwiedzający-niezalogowany powinien lądować od razu na `/auth/signin` (gdzie już siedzi `AppIntro` z S-03 Phase 5, tłumaczący o co chodzi). Dla zalogowanego flow bez zmian (signin → `/dashboard`, ścieżka z S-03 Phase 5).

Poza redirectem chcemy szersze odświeżenie wizualne:

- Więcej zróżnicowania typograficznego (wagi, rozmiary) i akcentów kolorystycznych — żeby nagłówki / treść / metadane wyraźnie się rozjeżdżały. Dziś prawie wszystko siedzi w jednym tonie szarawego blue-100/70-80, brakuje hierarchii.
- Ikony — w tej chwili w całym UI jest **zero ikon**. Decyzja: która biblioteka (lucide jest już w `package.json` jako `lucide-react`, do rozważenia czy używać tej, czy SVG inline, czy Iconify/heroicons). Wybór wpływa na bundle size i Astro vs React island.
- Ogólna poprawa hierarchii wizualnej — karty scenariuszy na `/dashboard`, sekcje na `/setup`, formularze auth.

Zakres do doprecyzowania w `/10x-plan` (lub `/10x-research`, jeśli wybór ikon biblioteki wymaga rozeznania):
- Czy zostawiamy istniejący root file (`src/pages/index.astro`?) jako `404` / placeholder, czy całkowicie zamieniamy na redirect (`Astro.redirect("/auth/signin")` z middleware lub samej strony)? Dla zalogowanego — redirect na `/dashboard` zamiast na signin.
- Skala palety: zostajemy przy obecnym gradiencie `from-blue-200 to-purple-200` jako akcencie, czy poszerzamy o trzeci-czwarty kolor dla różnicowania scenariuszy (np. zielony = retirement, czerwony = immediate, niebieski = housing, żółty = illness)?
- Set ikon — minimum potrzebny zestaw: scenariusze (4), nawigacja (Dashboard, Konfiguracja, Wyloguj, Pobierz cenę, Importuj), statusy (success / error / warning / info).

Out-of-scope (defer):
- Pełny redesign systemu komponentów (PDS-style) — to oddzielna iteracja.
- Dark/light mode toggle — aktualnie tylko dark, zostaje tak.
- Marketing landing page pod `/` (zamiast redirectu) — to inny scope, decyzja "redirect na auth/signin" tu z premedytacją.
