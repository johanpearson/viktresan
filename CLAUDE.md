# Viktresan

Personlig PWA för viktloggning. **En användare, ingen backend** – all data lagras lokalt
på enheten i IndexedDB. Publiceras på GitHub Pages under `/viktresan/`.

## Kommandon

| Kommando            | Vad det gör                                                     |
| ------------------- | --------------------------------------------------------------- |
| `npm run dev`       | Dev-server (http://localhost:5173/viktresan/). Ingen CSP i dev. |
| `npm run build`     | Typecheck (`tsc -b`) + produktionsbygge till `dist/` inkl. SW.  |
| `npm run preview`   | Serverar `dist/` på http://localhost:4173/viktresan/.           |
| `npm run lint`      | ESLint (typmedveten, strict) + Prettier-kontroll.               |
| `npm run format`    | Formaterar allt med Prettier.                                   |
| `npm run typecheck` | TypeScript utan emit.                                           |
| `npm test`          | Vitest (jsdom + fake-indexeddb).                                |
| `npm run test:e2e`  | Playwright, Pixel 7-emulering, mot produktionsbygget.           |
| `npm run icons`     | Regenererar PNG-ikoner i `public/` från SVG-källorna.           |

Kör `npm run lint && npm run typecheck && npm test && npm run test:e2e` innan push.

Lokalt utan nedladdade Playwright-browsers: sätt `PW_CHROMIUM_PATH` till en Chromium-binär
(t.ex. `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`). Kör aldrig `playwright install`
i molnmiljön.

## Arkitektur

```
index.html              Skal; CSP-meta injiceras vid bygge (vite.config.ts)
vite.config.ts          base, CSP-plugin, vite-plugin-pwa (manifest + Workbox), vitest
src/main.tsx            Startpunkt; anropar navigator.storage.persist()
src/App.tsx             Layout: header, aktiv sida, bottennavigering
src/routes.ts           Route-tabell (id, hash-path, svensk etikett)
src/lib/useHashRoute.ts Hash-routing via useSyncExternalStore
src/lib/storage.ts      Storage API: persist(), persisted(), estimate()
src/lib/useAppData.ts   Hook: läser mätningar + profil, `reload()` efter ändring
src/lib/usePhotos.ts    Hook: läser bilder + skapar/frigör object URLs
src/lib/image.ts        Bildkomprimering (max 1080 px WebP, JPEG-reserv) + borttagning av EXIF/XMP
src/lib/dates.ts        ISO-datum (YYYY-MM-DD): dagaritmetik i UTC, todayIso()
src/lib/stats.ts        Rena beräkningar: dagsvärden, EMA-trend, mål, BMI, veckosnitt, prognos
src/lib/format.ts       Svensk formatering/tolkning av kg, heltal, datum
src/lib/validation.ts   Validering av profil- och mätningsformulär
src/db/db.ts            IndexedDB via idb: schema, migreringar, dataåtkomst
src/components/         Delade komponenter (NavBar, Page, WeightChart, StepsChart …)
src/pages/              En komponent per sektion: Översikt, Logga, Historik, Steg, Bilder, Inställningar
e2e/                    Playwright-tester
scripts/                Engångsskript (ikongenerering)
```

- **Routing** är hash-baserad (`#/logga`) – GitHub Pages saknar SPA-fallback och det
  fungerar offline utan serverstöd. Ny sida: lägg till i `ROUTES` + `PAGES` i `App.tsx`.
- **Data**: `src/db/db.ts` är enda stället som pratar med IndexedDB. Object stores:
  `weights` (mätningar: vikt + valfritt midja/steg/anteckning, index `by-date`),
  `photos` (komprimerad Blob + valfri vikt/mått, index `by-date`), `settings` (key/value), `profile` (v2, nyckel `current`).
  Flera mätningar samma dag är tillåtna: vikt slås ihop till dagsmedel, steg tar senaste.
- **Beräkningar** ligger som rena funktioner i `src/lib/stats.ts` (tar in `today`, ingen
  I/O). Trenden är ett EMA (alpha 0,1/dag, luckor viktas som missade dagar); prognosen är
  en linjär anpassning över de senaste 28 dagarna.
  Schemaändring = höj `DB_VERSION` och lägg till ett nytt `if (oldVersion < N)`-block.
  Ändra aldrig befintliga migreringsblock – användarens data finns bara på enheten.
- **Grafer**: uPlot (`WeightChart`, `StepsChart`). Färger läses från CSS-variabler
  (`--accent`, `--chart-point`, `--chart-goal`).
- **PWA**: `vite-plugin-pwa` i `generateSW`-läge, `registerType: 'autoUpdate'`.
  Registrering sker via extern `registerSW.js` (inget inline-skript).
- **Bilder**: `compressImage()` skalar ner via canvas och kör `stripMetadata()` på resultatet
  (orientering bakas in via `createImageBitmap`). Kodningen är injicerbar (`ImageCodec`) för tester.
- **Beständig lagring**: `requestPersistence()` vid start; status + knapp i Inställningar.

## Säkerhet och integritet

- Strikt CSP (se `CSP` i `vite.config.ts`): allt `'self'`, inga `unsafe-inline`/`unsafe-eval`.
  Bilder får även vara `blob:`/`data:`. E2E-testerna failar på CSP-överträdelser.
- **Inga externa CDN:er, typsnitt, analysverktyg eller tredjepartsskript i runtime.**
  All kod ska bundlas. E2E-testet "inga förfrågningar till andra origins" vaktar detta.
- Inga `style="…"`-attribut i HTML och inga inline `<script>`. React-`style`-props och
  DOM-manipulation via JS är OK (CSSOM omfattas inte av `style-src`).
- Data lämnar aldrig enheten. Framtida export/import sker via filer som användaren väljer.

## Konventioner

- **UI-text på svenska.** Kod, identifierare och commit-meddelanden får vara engelska;
  kommentarer gärna svenska. Datum lagras som `YYYY-MM-DD`, vikt i kg (`weightKg`).
- TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. Inga `any`.
- Importera med filändelse (`./App.tsx`), named exports, en komponent per fil.
- Mobile-first CSS i `src/index.css` med CSS-variabler; ljust/mörkt tema följer
  `prefers-color-scheme`. Tryckytor minst 48 px (`--tap` = 56 px).
- Tillgänglighet: semantiska element, `aria-current` i navigeringen, fokus flyttas till
  sidrubriken vid sidbyte.
- Tester: enhetstester bredvid koden (`*.test.ts[x]`), e2e i `e2e/`. Testnamn på svenska.

## CI/CD

- `.github/workflows/ci.yml` (PR): lint, typecheck, vitest, bygg + Playwright (Pixel 7).
- `.github/workflows/deploy.yml` (push till `main`): bygger och publicerar `dist/` via
  `actions/deploy-pages`. Kräver att Pages-källan är satt till "GitHub Actions" i repots
  inställningar.
