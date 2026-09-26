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
| `npm run livsmedel` | Hämtar Livsmedelsverkets databas → `public/livsmedel.json`.     |

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
src/App.tsx             Layout: header, aktiv sida, uppdateringstoast, bottennavigering
src/routes.ts           Route-tabell (id, hash-path, svensk etikett, ev. funktion), gamla adresser
src/lib/useHashRoute.ts Hash-routing via useSyncExternalStore → { route, sub }
src/lib/features.ts     Funktionsbrytare: FEATURES, useFeatures() (filter/isEnabled), lagras i settings
src/lib/preferences.ts  Visningsinställningar per enhet (trendHero, stängt veckokort, profilsida, spökbild), usePreferences()
src/lib/shortcuts.ts    Genvägar på appikonen: SHORTCUTS (även manifestet), ?action= → åtgärd
src/lib/useShortcut.ts  Kör genvägen vid start: öppna panel, +250 ml med Ångra, erbjud att slå på funktion
src/lib/protein.ts      Proteinmål (faktor × målvikt) och proteinrik-regeln (≥ 15 g/100 kcal)
src/lib/milestones.ts   Milstolpar: regler (trendvikt), evaluateMilestones, kommande, diffMilestones, texter
src/lib/milestoneSync.ts  Milstolpar mot databasen: syncMilestones('silent' | 'live'), köade körningar
src/lib/celebration.ts  Kö med firanden (useCelebration); confetti.ts = canvas-confetti utan worker
src/lib/weekSummary.ts  Veckosummering mån–sön: trend, intag, protein, vatten, pass, steg + pilar och texter
src/lib/pwaUpdate.ts    Registrerar sw.js, söker uppdateringar, toast-tillstånd, SKIP_WAITING
src/lib/version.ts      Version, commit och byggtid (Vite define)
src/lib/calendar.ts     Månads-/veckorutnät + vad som loggats/planerats per dag (buildDayIndex)
src/lib/water.ts        Vattenmål (33 ml × trendvikt, 100 ml) och summor per dag
src/lib/workouts.ts     Träning: scheman → pass, status, obesvarade/dagens/kommande pass
src/lib/dayMarkers.ts   Loggtyper per dag (Kalender, Översikt → Idag), med funktion
src/lib/glp1.ts         GLP-1: schema, dostrappa, planerade/loggade doser, nästa dos, rotation, dosbyten
src/lib/storage.ts      Storage API: persist(), persisted(), estimate()
src/lib/useAppData.ts   Hook: läser vikt, midja, steg + profil; `reload()` returnerar ny data
src/lib/usePhotos.ts    Hook: läser fototillfällen och bilder + skapar/frigör object URLs
src/lib/photoSessions.ts  Fototillfällen/vinklar: gruppering, vinkelfilter, spökbild (pickGhost), trendvikt, jämförelse
src/lib/camera.ts       Kameravyn: getUserMedia-stöd, felmeddelanden, bildruta ur video (grabFrame)
src/lib/image.ts        Bildkomprimering (max 1080 px WebP, JPEG-reserv) + borttagning av EXIF/XMP
src/lib/dates.ts        ISO-datum (YYYY-MM-DD): dagaritmetik i UTC, todayIso()
src/lib/stats.ts        Rena beräkningar: dagsvärden, EMA-trend, mål, BMI, veckosnitt, prognos
src/lib/energy.ts       BMR (Mifflin-St Jeor), TDEE, kalorimål, spärrar, måldatumskontroll
src/lib/adaptiveTdee.ts Adaptiv TDEE ur trendvikt + matlogg, viktad mot formeln
src/lib/plan.ts         buildPlan(): profil + vikter + matlogg → dagens kalorimål
src/lib/planText.ts     Sakliga förklaringar (spärrar, måldatum, TDEE-källa)
src/lib/nutrition.ts    Näring per 100 g → per post/dag, makroandelar, 7-dagarssnitt, måltider
src/lib/units.ts        Enheter: volym via densitet, kategori (foodProfile), relevanta enheter, gissningar, förval, OFF-portion/förpackning
src/data/units.ts       Kuraterad tabell per livsmedel (Livsmedelsverket): styckvikter, egen densitet/kategori (ungefärliga)
src/data/foodCategories.ts  Kategorier: densitet, relevanta enheter, gissade styckvikter; namnmönster + Livsmedelsverkets grupper
src/lib/foodSearch.ts   FoodItem + fuzzy-sökning (å/ä/ö-vikning, Damerau-Levenshtein)
src/lib/foodCatalog.ts  Lagrat → FoodItem, snabbval (senaste, favoriter)
src/lib/livsmedel.ts    Laddar/tolkar public/livsmedel.json (format i livsmedelFormat.ts)
src/lib/livsmedelImport.ts  Ren omvandling av Livsmedelsverkets API-svar (används av skriptet)
src/lib/barcode.ts      EAN-validering + Open Food Facts-uppslag (injicerbar fetch)
src/lib/barcodeDetector.ts  Typning/fabrik för BarcodeDetector
src/lib/useFoodData.ts  Hook: egna livsmedel, måltider, favoriter + Livsmedelsverkets data
src/lib/format.ts       Svensk formatering/tolkning av kg, heltal, datum
src/lib/validation.ts   Validering av profil- och mätningsformulär
src/lib/backup.ts       Säkerhetskopia: zip (fflate), valfri kryptering, validering vid import
src/lib/backupReminder.ts  Ren logik för påminnelsen (7 dagar utan export)
src/lib/useBackupStatus.ts Hook: senaste export + om påminnelsen ska visas
src/lib/share.ts        Web Share API med nedladdning som reserv
src/lib/lock.ts         Valfritt WebAuthn-lås: tillstånd (useSyncExternalStore), lås/lås upp
src/db/db.ts            IndexedDB via idb: schema, migreringar, dataåtkomst, onDataChange
src/components/         Delade komponenter (NavBar, Page, WeightChart, StepsChart, ExportBackup,
                        ImportBackup, BackupReminder, LockGate, LockSettings …)
src/pages/              En komponent per sektion: Översikt, Logga (rutnät → bottom sheet), Mat
                        (Dag | Egna | Historik; `#/mat/logga` = panelen Logga mat), Kalender (Månad | Vecka),
                        Framsteg (Historik | Veckor | Bilder | Milstolpar), Inställningar
e2e/                    Playwright-tester (inkl. axe, offline, backup, lås, mat, träning, GLP-1, genvägar,
                        veckokort, milstolpar, bilder); hjälpare i helpers.ts. photos.spec.ts mockar getUserMedia
                        (nekad resp. canvas-ström) och skapar en v8-databas för migreringen. week.spec.ts styr tiden med page.clock. training.spec.ts och glp1.spec.ts styr tiden med page.clock.setFixedTime.
                        food.spec.ts blockerar service workern och mockar livsmedel.json,
                        Open Food Facts (page.route) och BarcodeDetector/kamera (addInitScript)
lighthouserc.json       Lighthouse CI-krav: installerbar PWA, tillgänglighet ≥ 0,9
scripts/                Engångsskript (ikongenerering inkl. genvägsikoner shortcut-*.svg, fetch-livsmedel.ts)
public/livsmedel.json   Livsmedelsverkets data, kompakt (en rad per livsmedel), precachad
```

- **Routing** är hash-baserad (`#/logga`) – GitHub Pages saknar SPA-fallback och det
  fungerar offline utan serverstöd. Ny sida: lägg till i `ROUTES` + `PAGES` i `App.tsx`.
  Bottennavigeringen: Översikt, Logga, Mat, Kalender, Framsteg (routes med `inNav: true`,
  filtrerade på funktioner); Inställningar nås via kugghjulet i Översikts rubrikrad.
  Flikar i Framsteg har egen delsökväg (`#/framsteg/bilder`). Gamla `#/historik`, `#/bilder`
  och `#/steg` skickas vidare (`MOVED`). En route för en avstängd funktion visar Översikt.
- **Funktionsbrytare** (`features.ts`, Inställningar → Funktioner): steg, midja, mat, vatten,
  träning, glp1, bilder. Lagras i `settings` under `features` med `version` (`FLAGS_VERSION`);
  lagrade värden för en funktion från före dess `availableSince` ignoreras (de var alltid "av"). Avstängd = dold överallt, datan
  ligger kvar och exporteras. Inga spridda if-satser: listor av vyer/flikar/rutor/markörer har
  ett `feature`-fält och filtreras med `useFeatures().filter(...)`; enstaka delar lindas i
  `<Feature id="…">`. GLP-1 är av som standard (`availableSince: 3`, `FLAGS_VERSION = 3`). En ny
  kommande funktion får `available: false` tills den byggs – sätt då `availableSince` och höj `FLAGS_VERSION`.
- **Data**: `src/db/db.ts` är enda stället som pratar med IndexedDB (`DB_VERSION = 9`). Object stores:
  `weights` (vikt + valfri anteckning, flera per dag, index `by-date`),
  `waist` (v3, midjemått, nyckel = `date`, ett per dag), `steps` (v3, steg, nyckel = `date`, ett per dag),
  `photos` (komprimerad Blob, `sessionId`, `angle` `fram`/`profil`/`okand`, `side` för profil, mått; index `by-date`,
  `by-session` (v9); `date` = kopia av tillfällets datum), `photoSessions` (v9, fototillfällen `{ id, date, weightKg?, note? }`,
  index `by-date`), `settings` (key/value), `profile` (v2, nyckel `current`),
  `foods` (v4, egna livsmedel `egen:<uuid>` + cachade Open Food Facts-träffar `off:<ean>`, index `by-ean`),
  `meals` (v4, sparade måltider med ingredienser i gram), `foodLog` (v4, matlogg, index `by-date`),
  `favorites` (v4, nyckel `foodId`), `water` (v5, en post per tillfälle, index `by-date`),
  `workouts` (v5, pass, index `by-date`), `workoutPlans` (v5, återkommande scheman),
  `medications` (v6, GLP-1-läkemedel med schema och dostrappa), `injections` (v6, loggade doser,
  index `by-date`), `symptoms` (v6, aptit/biverkningar, nyckel = `date`, ett per dag, `upsertSymptoms`),
  `foodUnits` (v7, användarens egna enheter per livsmedel, nyckel = `foodId`, alla källor, `saveCustomUnits`),
  `milestones` (v8, uppnådda milstolpar `{ id, date, createdAt }`, nyckel = milstolpens id, `addMilestones` skriver aldrig över).
  Migreringen v8 → v9 (`groupLegacyPhotos`, även för säkerhetskopior version 1–7) grupperar befintliga bilder i ett
  tillfälle per datum (id `migrerad:<datum>`, samma på alla enheter), vinkel `okand`; bildens vikt flyttas till tillfället
  (senast registrerade vinner). `putPhotoSession` flyttar bildernas `date` med tillfället; `deletePhoto` tar bort ett tomt tillfälle.
  Profilen har (sedan v4, valfria) `sex`, `birthYear`, `activityLevel`, `ratePerWeekKg` (standard 0,5)
  (0 = håll vikten/viktstabilisering: kalorimål = TDEE, spärren `maintenance`)
  och (v5) `waterGoalMl` (eget vattenmål, sparas från Inställningar → Vattenmål) samt `proteinFactor`
  (Inställningar → Proteinmål; ingen schemaändring, följer med i säkerhetskopian).
  Matloggposter och måltidsingredienser kopierar in namn och värden per 100 g – loggen ändras inte
  om livsmedlet ändras. Sedan v7 har de `amount` + `unit` (`g` = gram) och uträknade `grams`; gram
  är det som räknas, så en senare ändrad enhet påverkar inte historiken. Migreringen v6 → v7
  (`upgradeFoodData`, även för säkerhetskopior version 3–5) gör portioner till enheter: OFF-portion →
  `StoredFood.units`, eget livsmedels portion → `foodUnits`; loggar utan portion tolkas som gram. Livsmedels-id:n: `lv:<nummer>`, `egen:…`, `off:<ean>`, `maltid:<id>`.
  Midja och steg sparas med `upsertWaist`/`upsertSteps` (samma dag skrivs över, `createdAt` behålls).
  Migreringen v2 → v3 (`splitLegacyMeasurements`) flyttar midja/steg ur `weights`; per dag vinner
  den senast registrerade posten.
  `settings`-nycklar: `lastExportAt` (ms, senaste lyckade export), `lock` (`{ credentialId, createdAt }`
  när låset är på), `features` (funktionsbrytarna), `preferences` (`trendHero`, `weekCardDismissed`, `profileSide`,
  `ghostEnabled`, `ghostOpacity`). Inställningar ingår inte i säkerhetskopior – de är knutna till enheten.
  Flera viktmätningar samma dag är tillåtna och slås ihop till dagsmedel.
- **Beräkningar** ligger som rena funktioner i `src/lib/stats.ts` (tar in `today`, ingen
  I/O). Trenden är ett EMA (alpha 0,1/dag, luckor viktas som missade dagar); prognosen är
  en linjär anpassning över de senaste 28 dagarna.
  Schemaändring = höj `DB_VERSION` och lägg till ett nytt `if (oldVersion < N)`-block.
  Ändra aldrig befintliga migreringsblock – användarens data finns bara på enheten.
- **Kalorimål** (`energy.ts`, `adaptiveTdee.ts`, `plan.ts`): mål = TDEE − takt × 7 700 / 7.
  Spärrar: takt ≤ 1 kg/vecka och ≤ 1 % av trendvikten, mål ≥ 1 500 (man) / 1 200 (kvinna) kcal.
  Måldatum höjer aldrig underskottet – orimligt datum ger varning + tidigaste rimliga datum.
  Adaptiv TDEE: fönster ≤ 28 dagar t.o.m. igår, kräver ≥ 14 dagar med både vikt och matlogg och
  ≥ 80 % loggade dagar; regression på dagsvikterna, vikt = 0,9 × längd × täckning × precision
  (halveras om skattningen kläms till 0,6–1,6 × formeln).
- **Vatten**: mål = eget `waterGoalMl`, annars 33 ml × senaste EMA-trendvikten avrundat till 100 ml
  (utan mätningar: startvikten). `addWater` håller `createdAt` strikt växande per dag så att
  `undoLastWater` ("Ångra senaste") alltid tar dagens senaste post. Ring + snabbknappar i Översikt → Idag,
  valfri mängd i Logga → Vatten, historik i Framsteg → Historik.
- **Träning**: pass (`Workout`) har datum, valfri tid (`HH:MM`, lokal), typ (förval + egna ur tidigare
  pass), längd, valfri intensitet/anteckning och status `planerad`/`genomford`/`hoppad`. Scheman
  (`WorkoutPlan`: veckodagar 0 = mån, tid, start/slut) genereras till pass vid visning
  (`workoutsBetween`) och sparas först när de besvaras, med id `<planId>:<datum>` som då ersätter det
  genererade. Ett planerat pass vars tid passerat (utan tid: när dagen är slut) är _obesvarat_ och
  visas i "Blev passet av?" överst på Översikt (`findUnanswered`, 28 dagar bakåt). Idag visar dagens
  pass (utom obesvarade) med Klar / Hoppa över; Klar öppnar `CompleteWorkoutSheet` med planens längd
  och intensitet förifyllda. Kommande = tre nästa planerade efter idag. Kalenderns dagsvy har
  statusväljare (ändra i efterhand) och Klar. Prickar: genomfört fylld, planerat ring, obesvarat röd,
  hoppat grå fyrkant (`DayMarker.dots`).
- **GLP-1** (`glp1.ts`, bakom brytaren `glp1`): `Medication` har namn (förval Wegovy/Ozempic/Mounjaro/
  Saxenda + fritext), `frequency` `vecka` (med `weekday`, 0 = mån) eller `dag`, tid och en dostrappa
  (`steps`: datum + dos i mg, inmatad av användaren). Schemat börjar vid första steget; dosen ett datum
  = senaste steget på/före datumet. **Appen föreslår aldrig doser** – förifyllt värde kommer bara ur
  trappan (annars senast loggade dos) och `PRESCRIBER_NOTE` visas där doser läggs in. En veckodos räknas
  som tagen om en injektion av läkemedlet loggas inom ±3 dagar (dagsdos: samma dag). Planerade doser
  visas från idag (`dosesBetween`); `nextDose`/`dueToday` ger "Nästa dos" och dosdagsbannern på Översikt
  (länk till `#/logga/glp1`, som öppnar panelen direkt). Injektionsställe: `suggestSite` = oanvänt
  ställe i rotationsordning, annars det som använts längst tillbaka. Injektioner kopierar in
  läkemedlets namn. `doseChanges` (start + byte av dos/läkemedel) ritas som streckade linjer i
  viktgrafen (`WeightChart` `markers`, färg `--chart-dose`) och listas i Framsteg → Historik.
  Kalendern: romb-prick, fylld = loggad, kontur = planerad; `maende`-markören visar aptit/biverkningar.
- **Genvägar** (`shortcuts.ts`, manifestets `shortcuts` byggs från samma lista i vite.config.ts):
  "Logga vikt" (`?action=log-weight` → `#/logga/vikt`), "+250 ml vatten" (`add-water`: loggas direkt,
  Översikt + toast med Ångra) och "Logga mat" (`log-food` → `#/mat/logga`). `useShortcut` i `App` läser
  `?action=` en gång när brytarna är lästa och tar bort den ur adressen (omladdning kör inte om). Avstängd
  funktion → toast med "Slå på …" som slår på den och kör genvägen. Ikoner: `public/shortcut-*-96x96.png`.
- **Protein** (`protein.ts`): mål = `proteinFactor` (profil, 1,2–2,0 i steg om 0,1, saknas → 1,6) × målvikt.
  Ringar för kalorier och protein (`NutritionRings`) i Översikt → Idag och Mat → Dag; proteinkolumn och
  snitt i Mat → Historik. "Proteinrik" (≥ 15 g protein per 100 kcal) märks i sökträffar och favoriter.
- **Trendvikt**: `preferences.trendHero` (på som standard, Inställningar → Visning) visar trendvikten som
  huvudsiffra och dagsvikten under (`current-weight`), med en kort förklaring. Viktgrafen: trendlinjen
  tjock, dagsvärden som svaga punkter (`--chart-point-faint`).
- **Veckosummering** (`weekSummary.ts`, veckor mån–sön): `WeekSummaryCard` på Översikt visar förra veckan
  från veckans första öppning tills den stängs (`preferences.weekCardDismissed` = måndagen); alla avslutade
  veckor med data under Framsteg → Veckor (`pastWeeks`). Trend = EMA vid veckans slut − dagen före veckan
  (kräver vägning i veckan); snitt räknas över loggade dagar. Rader har `feature` och filtreras. Texter är
  sakliga och uppmuntrande, aldrig skuldbeläggande; uppgång (bort från målet) beskrivs neutralt.
- **Milstolpar** (`milestones.ts`, id:n `kg-1`, `kg-5`/`kg-10`/…, `procent-5|10`, `bmi-overvikt|normalvikt`,
  `halvvags-<mål>`, `mal-<mål>`, `dagar-7|30|100`, `pass-1|10|50`, `vatten-7`, `protein-7`, `bild-1`, `bild-30`):
  viktmilstolparna mäts på EMA-trendvikten (en dipp i dagsvikten triggar inte). Varje milstolpe sparas en gång
  med dagen den nåddes. `db.ts` meddelar `onDataChange` efter sparningar (vikt, midja, steg, profil, mat, vatten,
  pass, bilder); `MilestoneCenter` (i `App`) kör då `syncMilestones({ mode: 'live' })` och firar det viktigaste
  nyss nådda (inom 7 dagar, påslagen funktion). Vid start och efter import körs `silent`: passerade milstolpar
  sparas utan firande. Stora (5-kg-steg, 10 %, halvvägs, mål) = `CelebrationOverlay` (modal `<dialog>`, konfetti);
  små = `MilestoneToast` (popover högst upp, läggs i öppen panel så den går att trycka bort). prefers-reduced-motion
  → ingen animation/konfetti. "Mål nått" erbjuder nytt mål eller takt 0. `bild-30` länkar till
  `#/framsteg/bilder/jamfor` (första och senaste bilden jämförs). Framsteg → Milstolpar: uppnådda + tre närmaste.
- **Enheter** (`units.ts`): användaren väljer enhet och mängd – gram per enhet anges inte i normalfallet.
  Varje livsmedel får en kategori (`foodProfile`): regel i `src/data/units.ts` (bara `lv:`) → namnmönster
  (`CATEGORY_RULES`, normaliserat namn, klassas på delen före "m."/"i"/"u." …, provas även från senare ord
  utom `FIRST_WORD_ONLY`) → Livsmedelsverkets grupp (`GROUP_RULES`, valfri sjunde kolumn i
  `livsmedel.json`) → `ovrigt`. Kategorin (`CATEGORIES`) ger densitet (g/ml, `null` = ingen volym), vilka
  enheter som visas (vanligaste först) och gissade styckvikter. Enheterna (`unitsFor`) = livsmedlets egna
  (OFF "portion"/"förpackning", måltidens "portion") + kategorins i ordning: standardvikt (`standard`),
  volym (`volym`, `VOLUME_UNITS`: ml, cl, dl, l, krm 1, tsk 5, msk 15, glas 200, kopp 150 ml × densitet)
  eller gissning (`gissning`) + egna (`foodUnits`, vinner vid samma namn, läggs annars sist). Gram alltid
  sist. En gissning visas som "1 skiva ≈ 30 g, stämmer det?" – "Ja, det stämmer" eller "Justera" sparar
  den som egen enhet (`confirmGuess`). "Lägg till egen enhet" finns i livsmedlets detaljer ("Enheter för …",
  Egna → livsmedlet). `volym`/`gissning` lagras aldrig. Förval: senast använda (`lastUsage`), annars första
  enheten med känd vikt (egen/OFF/standard), annars kategorins första, annars 100 g. Alla värden
  (densitet, styckvikter) är ungefärliga. Vid redigering av en post gäller enhetens vikt när posten
  loggades (`entryUnit`).
  Open Food Facts: värden per 100 ml (`nutrition_data_per` = 100ml, eller förpackning i ml) →
  `per100Unit: 'ml'` på livsmedel, loggpost och ingrediens; mängden räknas då direkt i ml (densitet 1).
  `product_quantity`/`product_quantity_unit` (reserv `quantity`) → enheten "förpackning" (t.ex. 33 cl).
- **Livsmedel**: Livsmedelsverkets databas (CC BY 4.0 – källan visas i Mat-vyn) hämtas med
  `npm run livsmedel` (inkl. livsmedelsgrupp när API:t har den – `pickGroup`, förlåtande tolkning) och checkas in – workflowet `livsmedel.yml` gör det automatiskt när skriptet
  ändras, eller manuellt via Actions. Appen anropar aldrig Livsmedelsverket. Streckkoder:
  `BarcodeDetector` + kamera, annars manuell EAN. Okända koder slås upp i Open Food Facts
  (enda externa anropet, bara streckkoden skickas) och cachas i `foods`.
- **Grafer**: uPlot (`WeightChart`, `StepsChart`, `IntakeChart`). Färger läses från CSS-variabler
  (`--accent`, `--chart-point`, `--chart-goal`).
- **PWA**: `vite-plugin-pwa` i `generateSW`-läge, `registerType: 'prompt'`, `injectRegister: false`,
  `clientsClaim: true`. `pwaUpdate.ts` registrerar `sw.js` (bundlad kod, `updateViaCache: 'none'`)
  och söker uppdateringar vid start och vid `visibilitychange` (högst var 30:e minut) samt via
  "Sök efter uppdatering" (Inställningar → Om appen). Väntande worker → toast "Ny version finns";
  Uppdatera = `SKIP_WAITING` + omladdning vid `controllerchange`. `sw.js` precachas aldrig och
  `index.html` precachas med revision. E2E: preview-servern serverar en "ny" sw.js för kontexter
  med kakan `e2e-ny-version=1` (bara med `VIKTRESAN_E2E=1`, se `e2eNewVersion` i vite.config.ts).
- **Version**: `__APP_VERSION__` (package.json), `__APP_COMMIT__`, `__APP_BUILD_TIME__` via Vite
  `define`. Deploy-workflowen sätter `APP_COMMIT`/`APP_BUILD_TIME`; lokalt läses git.
- **Bilder**: `compressImage()` skalar ner via canvas och kör `stripMetadata()` på resultatet
  (orientering bakas in via `createImageBitmap`). Kodningen är injicerbar (`ImageCodec`) för tester.
  Fototillfällen (`PhotoSessionFlow` i en panel): datum, vikt (förifylld med trendvikten, högst 7 dagar gammal) och
  anteckning → framifrån → profil; varje steg kan hoppas över, tillfället sparas vid första bilden. `CameraCapture`
  (getUserMedia, modal `<dialog>`): bakre/främre kamera (främre speglas i förhandsvisningen men sparas oförändrad),
  självutlösare 3/10 s, spökbild = senaste bilden i samma vinkel från ett annat tillfälle (profil: samma sida först),
  opacitet/av sparas i `preferences`. Saknas getUserMedia eller nekas den → filväljare med `capture`; "Välj från
  galleriet" finns alltid. Bildrutan går genom `compressImage` som en vald fil. Galleri: Tillfällen (en rad per
  tillfälle, framifrån + profil, tom plats = "Lägg till") eller en vinkel i rutnät. "Ange vinkel" listar bilder med
  `okand` med snabbval på bilden. Jämförelse (`SessionCompare`): två tillfällen, vinkel eller båda, sida vid sida/
  reglage, dagar och viktskillnad; "Första mot senaste" (förval, även `#/framsteg/bilder/jamfor`). Profilsida:
  Inställningar → Bilder.
- **Beständig lagring**: `requestPersistence()` vid start; status + knapp i Inställningar.

### Säkerhetskopiering och återställning

- **Export** (Inställningar → Säkerhetskopia): `readSnapshot()` → `createBackup()` → `shareOrDownload()`.
  Web Share API används om `navigator.canShare({ files })` är sant, annars laddas filen ner.
  `lastExportAt` sätts bara om filen faktiskt delades/laddades ner (inte vid avbruten delning).
- **Filformat** (`BACKUP_FORMAT = 'viktresan-backup'`, `BACKUP_VERSION = 8`):
  - Okrypterad zip: `backup.json` (format, version, exportedAt, profil, `weights`, `waist`, `steps`,
    `photoSessions`, bildmetadata med `file`, `sessionId`, `angle`, `foods`, `meals`, `foodLog`, `favorites`, `water`, `workouts`,
    `workoutPlans`, `medications`, `injections`, `symptoms`, `foodUnits`, `milestones`) + `photos/<id>.<ext>` (bilderna oförändrade, okomprimerat i zip:en).
  - Version 1 (kombinerade `measurements`) kan fortfarande importeras; den delas upp med
    `splitLegacyMeasurements`. Version 1–2 saknar mat och ger tomma matlistor; version 1–3 saknar
    vatten och träning och ger tomma listor; version 1–4 saknar GLP-1 och ger tomma listor; version 3–5
    har portioner i stället för enheter och uppgraderas med `upgradeFoodData`; version 1–6 saknar milstolpar
    (tom lista – efter importen markeras passerade milstolpar utan firande); version 1–7 saknar fototillfällen och
    grupperas med `groupLegacyPhotos` (vinkel "ej angiven"). En bild vars `sessionId` saknas bland tillfällena avvisas.
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
  - `merge`: nya poster läggs till; samma nyckel (id, för midja/steg/mående datum, för egna enheter `foodId`) → senast ändrad (milstolpar: befintlig behålls) (`updatedAt ?? createdAt`) vinner,
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
  Enda undantaget i `connect-src` är `https://world.openfoodfacts.org` (streckkodsuppslag).
  All kod ska bundlas. E2E-testet "inga förfrågningar till andra origins" vaktar detta.
- Inga `style="…"`-attribut i HTML och inga inline `<script>`. React-`style`-props och
  DOM-manipulation via JS är OK (CSSOM omfattas inte av `style-src`).
- Data lämnar aldrig enheten, utom streckkoden vid uppslag i Open Food Facts. Export/import sker
  via filer som användaren väljer.

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
