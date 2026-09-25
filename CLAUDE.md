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

Lighthouse CI lokalt (efter `npm run build`):
`CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx --yes @lhci/cli@0.13.0 autorun`.

Kör `npm run lint && npm run typecheck && npm test && npm run test:e2e` innan push.

Lokalt utan nedladdade Playwright-browsers: sätt `PW_CHROMIUM_PATH` till en Chromium-binär
(t.ex. `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`). Kör aldrig `playwright install`
i molnmiljön.

## Arkitektur

```
index.html              Skal; CSP-meta injiceras vid bygge (vite.config.ts)
vite.config.ts          base, CSP-plugin, vite-plugin-pwa (manifest + Workbox), vitest
src/main.tsx            Startpunkt; anropar navigator.storage.persist(), lindar App i LockGate
src/App.tsx             Layout: header, aktiv sida, bottennavigering
src/routes.ts           Route-tabell (id, hash-path, svensk etikett)
src/lib/useHashRoute.ts Hash-routing via useSyncExternalStore
src/lib/storage.ts      Storage API: persist(), persisted(), estimate()
src/lib/useAppData.ts   Hook: läser vikt, midja, steg + profil; `reload()` returnerar ny data
src/lib/usePhotos.ts    Hook: läser bilder + skapar/frigör object URLs
src/lib/image.ts        Bildkomprimering (max 1080 px WebP, JPEG-reserv) + borttagning av EXIF/XMP
src/lib/dates.ts        ISO-datum (YYYY-MM-DD): dagaritmetik i UTC, todayIso()
src/lib/stats.ts        Rena beräkningar: dagsvärden, EMA-trend, mål, BMI, veckosnitt, prognos
src/lib/format.ts       Svensk formatering/tolkning av kg, heltal, datum
src/lib/validation.ts   Validering av profil- och mätningsformulär
src/lib/backup.ts       Säkerhetskopia: zip (fflate), valfri kryptering, validering vid import
src/lib/backupReminder.ts  Ren logik för påminnelsen (7 dagar utan export)
src/lib/useBackupStatus.ts Hook: senaste export + om påminnelsen ska visas
src/lib/share.ts        Web Share API med nedladdning som reserv
src/lib/lock.ts         Valfritt WebAuthn-lås: tillstånd (useSyncExternalStore), lås/lås upp
src/db/db.ts            IndexedDB via idb: schema, migreringar, dataåtkomst
src/components/         Delade komponenter (NavBar, Page, WeightChart, StepsChart, ExportBackup,
                        ImportBackup, BackupReminder, LockGate, LockSettings …)
src/pages/              En komponent per sektion: Översikt, Logga (Vikt | Midja), Historik,
                        Steg (dagens steg + graf), Bilder, Inställningar
e2e/                    Playwright-tester (inkl. axe, offline, backup, lås); hjälpare i helpers.ts
lighthouserc.json       Lighthouse CI-krav: installerbar PWA, tillgänglighet ≥ 0,9
scripts/                Engångsskript (ikongenerering)
```

- **Routing** är hash-baserad (`#/logga`) – GitHub Pages saknar SPA-fallback och det
  fungerar offline utan serverstöd. Ny sida: lägg till i `ROUTES` + `PAGES` i `App.tsx`.
  Bottennavigeringen visar routes med `inNav: true` (5 st); Inställningar nås via kugghjulet
  i Översikts rubrikrad (`Page`-propen `action`).
- **Data**: `src/db/db.ts` är enda stället som pratar med IndexedDB (`DB_VERSION = 3`). Object stores:
  `weights` (vikt + valfri anteckning, flera per dag, index `by-date`),
  `waist` (v3, midjemått, nyckel = `date`, ett per dag), `steps` (v3, steg, nyckel = `date`, ett per dag),
  `photos` (komprimerad Blob + valfri vikt/mått, index `by-date`), `settings` (key/value), `profile` (v2, nyckel `current`).
  Midja och steg sparas med `upsertWaist`/`upsertSteps` (samma dag skrivs över, `createdAt` behålls).
  Migreringen v2 → v3 (`splitLegacyMeasurements`) flyttar midja/steg ur `weights`; per dag vinner
  den senast registrerade posten.
  `settings`-nycklar: `lastExportAt` (ms, senaste lyckade export), `lock` (`{ credentialId, createdAt }`
  när låset är på). Inställningar ingår inte i säkerhetskopior – de är knutna till enheten.
  Flera viktmätningar samma dag är tillåtna och slås ihop till dagsmedel.
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

### Säkerhetskopiering och återställning

- **Export** (Inställningar → Säkerhetskopia): `readSnapshot()` → `createBackup()` → `shareOrDownload()`.
  Web Share API används om `navigator.canShare({ files })` är sant, annars laddas filen ner.
  `lastExportAt` sätts bara om filen faktiskt delades/laddades ner (inte vid avbruten delning).
- **Filformat** (`BACKUP_FORMAT = 'viktresan-backup'`, `BACKUP_VERSION = 2`):
  - Okrypterad zip: `backup.json` (format, version, exportedAt, profil, `weights`, `waist`, `steps`,
    bildmetadata med `file`) + `photos/<id>.<ext>` (bilderna oförändrade, okomprimerat i zip:en).
  - Version 1 (kombinerade `measurements`) kan fortfarande importeras; den delas upp med
    `splitLegacyMeasurements`.
  - Krypterad zip: `backup.json` med bara format, version och parametrar (PBKDF2-SHA-256,
    600 000 iterationer, 16 byte salt; AES-256-GCM, 12 byte iv) + `backup.enc` = hela den
    okrypterade zip:en krypterad. AAD = `viktresan-backup:<version>`. Lösenord minst 8 tecken.
  - Ändras formatet: höj `BACKUP_VERSION` och låt `readBackup` fortsätta läsa gamla versioner.
- **Import**: `readBackup(file, password?)` validerar allt och bygger nya objekt (okända fält
  släpps). Fel kastas som `BackupError` med `code`: `not-a-backup`, `unsupported-version`,
  `invalid-data`, `password-required`, `wrong-password`. UI:t visar förhandsvisning
  (`summarizeBackup`) och låter användaren välja läge. `applySnapshot()` skriver i **en**
  transaktion:
  - `replace`: profil, mätningar och bilder töms och ersätts.
  - `merge`: nya poster läggs till; samma nyckel (id, för midja/steg datum) → senast ändrad (`updatedAt ?? createdAt`) vinner,
    lika → befintlig behålls. Befintlig profil behålls; saknas den tas den från filen.
- **Påminnelse** (`BackupReminder` på Översikt): visas när det finns data och ingen export gjorts
  på 7 dagar. Utan tidigare export räknas från äldsta postens `createdAt`.
- Tester: `src/lib/backup.test.ts` (round-trip okrypterat/krypterat, fel lösenord, validering,
  merge; körs i `node`-miljö eftersom jsdoms Blob inte klarar structuredClone), `e2e/backup.spec.ts`.

### Lås (valfritt, av som standard)

- `LockGate` (i `main.tsx`) renderar ingenting tills låsinställningen är läst, sedan antingen
  låsskärmen eller appen. Låst vid start och på `visibilitychange` → `hidden`, utom medan en
  WebAuthn-dialog pågår (systemdialogen kan dölja sidan).
- Påslagning: `navigator.credentials.create` med `authenticatorAttachment: 'platform'`,
  `userVerification: 'required'`; `rawId` sparas. Upplåsning: `navigator.credentials.get` med
  `allowCredentials` = sparat id; kontrollerar id och UP/UV-flaggorna i `authenticatorData`.
- Ingen server finns, så signaturen verifieras inte mot en utmaning – låset är ett
  integritetsskydd för gränssnittet, **inte kryptering**. Datan i IndexedDB är oförändrad.
- E2E använder Chromes virtuella autentiserare via CDP (`WebAuthn.addVirtualAuthenticator`).

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

- `.github/workflows/ci.yml` (PR): lint, typecheck, vitest, bygg; Playwright (Pixel 7);
  Lighthouse CI (`@lhci/cli@0.13.0` = Lighthouse 11, den sista med PWA-kategorin) med krav på
  installerbar PWA (`installable-manifest`, `categories:pwa`) och tillgänglighet ≥ 0,9. Rapporten
  sparas som artefakt (`target: filesystem` – inget laddas upp till tredje part).
- Playwright-kvalitetstester: `e2e/a11y.spec.ts` (axe, WCAG 2.2 AA + best practice, ljust och
  mörkt tema), `e2e/offline.spec.ts` (flygplansläge efter första laddningen, även ny flik), och
  `Page.getInstallabilityErrors` via CDP i `e2e/app.spec.ts`.
- `.github/workflows/deploy.yml` (push till `main`): bygger och publicerar `dist/` via
  `actions/deploy-pages`. Kräver att Pages-källan är satt till "GitHub Actions" i repots
  inställningar.
