# Viktresan

Personlig PWA för viktloggning. **En användare, ingen backend** – all data lagras lokalt
på enheten i IndexedDB. Publiceras på GitHub Pages under `/viktresan/`.

## Kommandon

| Kommando                     | Vad det gör                                                     |
| ---------------------------- | --------------------------------------------------------------- |
| `npm run dev`                | Dev-server (http://localhost:5173/viktresan/). Ingen CSP i dev. |
| `npm run build`              | Typecheck (`tsc -b`) + produktionsbygge till `dist/` inkl. SW.  |
| `npm run preview`            | Serverar `dist/` på http://localhost:4173/viktresan/.           |
| `npm run lint`               | ESLint (typmedveten, strict) + Prettier-kontroll.               |
| `npm run format`             | Formaterar allt med Prettier.                                   |
| `npm run typecheck`          | TypeScript utan emit.                                           |
| `npm test`                   | Vitest (jsdom + fake-indexeddb).                                |
| `npm run test:e2e`           | Playwright, Pixel 7-emulering, mot produktionsbygget.           |
| `npm run test:visual`        | Visuella regressionstester i Playwrights Docker-avbild.         |
| `npm run test:visual:update` | Nya baslinjer (`e2e/__screenshots__/`) – granska och committa.  |
| `npm run icons`              | Regenererar PNG-ikoner i `public/` från SVG-källorna.           |
| `npm run livsmedel`          | Hämtar Livsmedelsverkets databas → `public/livsmedel.json`.     |

Lighthouse CI lokalt (efter `npm run build`):
`CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx --yes @lhci/cli@0.13.0 autorun`.

Kör `npm run lint && npm run typecheck && npm test && npm run test:e2e` innan push, och
`npm run test:visual` vid UI-ändringar (kräver Docker; i molnmiljön: starta `dockerd` först).

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
src/lib/water.ts        Dryckesmål (kön, EFSA; +500 ml träningsdagar), drycker ur matloggen (ej alkohol), summor per dag
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
src/lib/foodDay.ts      Mat → Dag: sektioner per måltid (summa, antal), pågående måltid, ingredienser i loggad måltid, datumetikett,
                        spara som egen måltid (savedMealName, entriesToMealItems)
src/lib/mealAnalysis.ts Lokal analys: summor (makron, fiber, socker, salt, vitaminer, mineraler) i % av dagsmål/RI, nyckeltal
src/lib/quickLog.ts     Snabblogg: kcal (+ protein) som matloggpost med `estimated`, id `snabb:<namn>:<kcal>:<protein>`
src/lib/recipes.ts      Recept: utbyte (portioner/tillagad vikt), näring per portion och 100 g, kopia till loggen, duplicera
src/lib/useIngredients.ts  Hook: ingrediensrader för egna måltider och recept (IngredientEditor)
src/lib/weekBudget.ts   Veckobudget: 7 × dagsmål, dagens förslag = kvar / dagar kvar, golvspärr, dayTarget()
src/lib/swaps.ts        Bytesförslag: samma kategori, klart bättre protein/kcal eller fiber, aldrig mer energi
src/lib/aiPrompt.ts     "Fråga AI": kryssrutor (AI_OPTIONS), underlag (aiContextFrom), promptbyggare, ChatGPT-/Claude-länkar
src/lib/aiPromptTemplate.ts  Promptmallen på svenska ({{amne}}, {{amneKort}}, {{underlag}}, {{kalorigolv}}) – redigera här
src/data/nutrients.ts   Övriga näringsämnen: nyckel, enhet, RI (EU 1169/2011; fiber NNR), EuroFIR-kod/namn för importen
src/lib/units.ts        Enheter: volym via densitet, kategori (foodProfile), relevanta enheter, gissningar, förval, OFF-portion/förpackning
src/data/units.ts       Kuraterad tabell per livsmedel (Livsmedelsverket): styckvikter, egen densitet/kategori (ungefärliga)
src/data/foodCategories.ts  Kategorier: densitet, relevanta enheter, gissade styckvikter; namnmönster + Livsmedelsverkets grupper
src/lib/foodSearch.ts   FoodItem + fuzzy-sökning (å/ä/ö-vikning, Damerau-Levenshtein)
src/lib/foodCatalog.ts  Lagrat → FoodItem, snabbval (senaste, favoriter)
src/lib/livsmedel.ts    Laddar/tolkar public/livsmedel.json (format i livsmedelFormat.ts)
src/lib/livsmedelImport.ts  Ren omvandling av Livsmedelsverkets API-svar (används av skriptet)
src/lib/barcode.ts      EAN-validering + Open Food Facts-uppslag (injicerbar fetch), tillskott per portion, bidragslänk
src/lib/barcodeDetector.ts  Typning/fabrik för BarcodeDetector
src/lib/barcodeLookup.ts  Uppslag av en skannad kod: lokalt (livsmedel, måltider, tillskott) före OFF, korsträff Mat/Tillskott
src/lib/scanner.ts      Skannerns kameralogik: ljusnivå (luma, hysteres), ficklampa/zoom/fokus ur capabilities
src/lib/aiLabel.ts      "Lägg in med AI från etikett": prompter och JSON-validering (tillskott per dos, livsmedel per 100 g)
src/lib/clipboard.ts    copyText (med execCommand-reserv) och shareText (Web Share)
src/lib/supplements.ts  Tillskott: former, scheman, dagens tillskott, tagna doser (intakeFor), mängder per ämne
src/lib/nutrientUnits.ts  Enheter för vitaminer/mineraler: g/mg/µg och IE (D-vitamin, 1 µg = 40 IE), tillåtna ämnen
src/lib/micronutrients.ts  Näringssummering: mat + tillskott per ämne och dag, 7-dagarssnitt, UL-varningar med bidrag
src/data/upperLimits.ts EFSA:s övre gränsvärden (UL) för vuxna med källa; `appliesTo` total eller bara tillskott
src/lib/useFoodData.ts  Hook: egna livsmedel, måltider, favoriter + Livsmedelsverkets data
src/lib/format.ts       Svensk formatering/tolkning av kg, heltal, datum
src/lib/validation.ts   Validering av profil- och mätningsformulär
src/lib/backup.ts       Säkerhetskopia: zip (fflate), valfri kryptering, validering vid import
src/lib/backupReminder.ts  Ren logik för påminnelsen (7 dagar utan export)
src/lib/useBackupStatus.ts Hook: senaste export + om påminnelsen ska visas
src/lib/share.ts        Web Share API med nedladdning som reserv
src/lib/lock.ts         Valfritt WebAuthn-lås: tillstånd (useSyncExternalStore), lås/lås upp
src/db/db.ts            IndexedDB via idb: schema, migreringar, dataåtkomst, onDataChange (DB_VERSION 11)
src/components/         Delade komponenter (NavBar, Page, WeightChart, StepsChart, ExportBackup,
                        ImportBackup, BackupReminder, LockGate, LockSettings …). Designsystemet (docs/DESIGN.md):
                        Page (sticky rubrik som krymper), Card, ListRow, SectionAccordion, BottomSheet,
                        SegmentedControl, StatBar, GoalRing, ProgressBar, EmptyState, Toast, Skeleton,
                        ActionSheet (radmeny ovanpå en panel), DateBar (‹ Idag ›, även i Logga-panelernas formulär),
                        StorageSettings (Inställningar → Lagring), ShowMore (+ useShowMore: 14 rader, sedan fler),
                        RangeFilter (tidsfilter som chips), DailyBarChart (staplar per dag: steg, dryck),
                        PeriodBar (‹ månad/vecka ›), Disclosure (hopfälld hjälptext), Parts (bryts bara vid "·"),
                        ChoiceList (valrader i stället för radioknappar), ChipGroup (val som chips)
src/lib/useSwipe.ts     Svep med pekarhändelser (ListRow): vänster = ta bort, höger = t.ex. favorit
src/lib/useUndoToast.ts Toast med Ångra efter borttagning i en lista (Logga-panelerna)
src/lib/tones.ts        Färgtoner per datatyp (`tone-food` → `--tone`) för staplar och ringar
src/lib/haptics.ts      haptic('success' | 'light') via navigator.vibrate (inställning + reducerad rörelse)
src/lib/motion.ts       prefersReducedMotion()
docs/DESIGN.md          Designsystemet: tokens, komponenter, regler, mikrointeraktioner
docs/ui-audit.md        UI-granskningen per vy med prioritet och ordning för kvarvarande vyer
src/pages/              En komponent per sektion: Översikt, Logga (rutnät → bottom sheet), Mat
                        (Dag | Egna | Historik | Näring som segment i rubriken; `#/mat/logga` = sök-sheeten), Kalender (Månad | Vecka i rubriken, förklaringen hopfälld,
                        dagsvyn = CalendarDay), Framsteg (Historik | Veckor | Bilder | Milstolpar), Inställningar
e2e/                    Playwright-tester. supplements.spec.ts mockar getUserMedia (spår med/utan torch/zoom),
                        BarcodeDetector (kod via `window.__ean`) och OFF. visual.spec.ts + visualData.ts = visuella regressionstester (egen
                        Playwright-projekt `visual`, fryst datum, fast data, baslinjer i e2e/__screenshots__). Övriga (inkl. axe, offline, backup, lås, mat, träning, GLP-1, genvägar,
                        veckokort, milstolpar, bilder, måltidsanalys); hjälpare i helpers.ts. mealAnalysis.spec.ts mockar
                        clipboard, navigator.share och window.open (addInitScript). photos.spec.ts mockar getUserMedia
                        (nekad resp. canvas-ström) och skapar en v8-databas för migreringen. week.spec.ts styr tiden med page.clock. training.spec.ts och glp1.spec.ts styr tiden med page.clock.setFixedTime.
                        food.spec.ts blockerar service workern och mockar livsmedel.json,
                        Open Food Facts (page.route) och BarcodeDetector/kamera (addInitScript); svep görs med
                        dispatchEvent('pointer…') (`swipeLeft` i helpers.ts) och pågående måltid styrs med page.clock.setFixedTime
lighthouserc.json       Lighthouse CI-krav: installerbar PWA, tillgänglighet ≥ 0,9
scripts/                Engångsskript (ikongenerering inkl. genvägsikoner shortcut-*.svg, fetch-livsmedel.ts)
public/livsmedel.json   Livsmedelsverkets data, kompakt (en rad per livsmedel), precachad
```

- **Routing** är hash-baserad (`#/logga`) – GitHub Pages saknar SPA-fallback och det
  fungerar offline utan serverstöd. Ny sida: lägg till i `ROUTES` + `PAGES` i `App.tsx`.
  Bottennavigeringen: Översikt, Logga, Mat, Kalender, Framsteg (routes med `inNav: true`,
  filtrerade på funktioner); Inställningar nås via kugghjulet i Översikts rubrikrad. Inställningar är
  grupperade rader (`GROUPS` i `Installningar.tsx`, med `feature`) som öppnar en panel; `#/installningar/<panel>`
  (`profil`, `kalorimal`, `protein`, `dryck`, `matpreferenser`, `funktioner`, `visning`, `bilder`, `las`, `sakerhetskopia`,
  `lagring`, `om`) öppnar panelen direkt.
  Flikar i Framsteg har egen delsökväg (`#/framsteg/bilder`). Gamla `#/historik`, `#/bilder`
  och `#/steg` skickas vidare (`MOVED`). En route för en avstängd funktion visar Översikt.
- **Funktionsbrytare** (`features.ts`, Inställningar → Funktioner): steg, midja, mat, vatten,
  träning, glp1, tillskott, bilder. Lagras i `settings` under `features` med `version` (`FLAGS_VERSION`);
  lagrade värden för en funktion från före dess `availableSince` ignoreras (de var alltid "av"). Avstängd = dold överallt, datan
  ligger kvar och exporteras. Inga spridda if-satser: listor av vyer/flikar/rutor/markörer har
  ett `feature`-fält och filtreras med `useFeatures().filter(...)`; enstaka delar lindas i
  `<Feature id="…">`. GLP-1 är av som standard (`availableSince: 3`); Tillskott också (`availableSince: 4`, `FLAGS_VERSION = 4`). En ny
  kommande funktion får `available: false` tills den byggs – sätt då `availableSince` och höj `FLAGS_VERSION`.
- **Data**: `src/db/db.ts` är enda stället som pratar med IndexedDB (`DB_VERSION = 11`). Object stores:
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
  `milestones` (v8, uppnådda milstolpar `{ id, date, createdAt }`, nyckel = milstolpens id, `addMilestones` skriver aldrig över),
  `supplements` (v10, tillskott: namn, `form`, `amountPerDose`, `nutrients` per dos `{ key, amount, unit }` i angiven enhet,
  `schedule` `dagligen`/`veckodagar` (+ `weekdays`)/`vid-behov`, `dosesPerDay`, valfri `ean`; index `by-ean`),
  `supplementLog` (v10, tagna doser, id = `<tillskott>:<datum>`, en per tillskott och dag, namn och ämnen kopieras in;
  index `by-date`), `recipes` (v11, recept: ingredienser som måltider, `servings` och/eller `cookedWeightG`; livsmedels-id
  `recept:<id>`). Matloggposter har sedan v11 (utan datamigrering) valfria `estimated: true` (snabblogg: 1 portion = 100 "g",
  `per100` = hela värdet, ingår inte i vitaminer/mineraler – `DayNutrition.estimatedEntries`) och `recipe` (`{ yieldG, items }`,
  receptet som det såg ut vid loggningen – `partsOf`/ingredienser läser kopian, så en receptändring bara påverkar nya loggar).
  `SavedMeal` har sedan v10 en valfri `ean` (ingen schemaändring – skanning hittar måltiden).
  Migreringen v8 → v9 (`groupLegacyPhotos`, även för säkerhetskopior version 1–7) grupperar befintliga bilder i ett
  tillfälle per datum (id `migrerad:<datum>`, samma på alla enheter), vinkel `okand`; bildens vikt flyttas till tillfället
  (senast registrerade vinner). `putPhotoSession` flyttar bildernas `date` med tillfället; `deletePhoto` tar bort ett tomt tillfälle.
  Profilen har (sedan v4, valfria) `sex`, `birthYear`, `activityLevel`, `ratePerWeekKg` (standard 0,5)
  (0 = håll vikten/viktstabilisering: kalorimål = TDEE, spärren `maintenance`)
  och (v5) `waterGoalMl` (eget dryckesmål, sparas från Inställningar → Dryckesmål), `waterTrainingBonus`
  (+500 ml på träningsdagar, utan schemaändring) samt `proteinFactor`
  (Inställningar → Proteinmål; ingen schemaändring, följer med i säkerhetskopian) och `foodPreferences`
  (Inställningar → Matpreferenser, fritext ≤ 1 000 tecken, bara för "Fråga AI"; ingen schemaändring) och `calorieMode`
  (`dag`/`vecka`, Inställningar → Kalorimål; ingen schemaändring).
  Matloggposter och måltidsingredienser kopierar in namn och värden per 100 g – loggen ändras inte
  om livsmedlet ändras. Sedan v7 har de `amount` + `unit` (`g` = gram) och uträknade `grams`; gram
  är det som räknas, så en senare ändrad enhet påverkar inte historiken. Migreringen v6 → v7
  (`upgradeFoodData`, även för säkerhetskopior version 3–5) gör portioner till enheter: OFF-portion →
  `StoredFood.units`, eget livsmedels portion → `foodUnits`; loggar utan portion tolkas som gram. Livsmedels-id:n: `lv:<nummer>`, `egen:…`, `off:<ean>`, `maltid:<id>`.
  Midja och steg sparas med `upsertWaist`/`upsertSteps` (samma dag skrivs över, `createdAt` behålls).
  `putWaist`/`putSymptoms` lägger tillbaka en borttagen post oförändrad (Ångra).
  Migreringen v2 → v3 (`splitLegacyMeasurements`) flyttar midja/steg ur `weights`; per dag vinner
  den senast registrerade posten.
  `settings`-nycklar: `lastExportAt` (ms, senaste lyckade export), `lock` (`{ credentialId, createdAt }`
  när låset är på), `features` (funktionsbrytarna), `preferences` (`trendHero`, `weekCardDismissed`, `profileSide`,
  `ghostEnabled`, `ghostOpacity`, `aiOptions` – kryssrutorna i "Fråga AI", `haptics` – vibration vid spara). Inställningar ingår inte i säkerhetskopior – de är knutna till enheten.
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
- **Veckobudget** (`weekBudget.ts`, `profile.calorieMode = 'vecka'`): budget = 7 × dagsmålet (mån–sön). Dagens förslag =
  (budget − intag före idag) / dagar kvar inkl. idag; tidigare dagar utan matlogg räknas som dagsmålet. Förslaget går aldrig
  under golvet (`floorKcal`) – räcker inte budgeten visas det sakligt med förslag att fördela resten över nästa vecka.
  `dayTarget()` ger målet som Mat → Dag (`DaySummary` + `WeekBudgetStatus`) och Översikt → Idag använder. Veckosummeringen
  har raden `budget` (loggat mot budget, bara i veckoläge).
- **Snabblogg och recept**: sök-sheeten har raden "Snabblogg" (`QuickLogForm`); snabbval under Senaste/Favoriter
  ("≈ 700 kcal") öppnar den förifylld. Recept (Mat → Egna, `RecipeBuilder`) söks och listas under Måltider i sök-sheeten,
  loggas i portioner (½, 1, 1½, 2) eller gram och kan dupliceras.
- **Dryck** (i UI:t "Dryck"; internt heter det fortfarande `water`/`vatten` – store, funktion, route
  `#/logga/vatten`): mål = eget `waterGoalMl`, annars standardmål efter kön: 2 000 ml (man) / 1 600 ml
  (kvinna), 1 800 ml utan kön – dryckesdelen (~80 %) av EFSA:s totala vätskeintag. Ingen koppling till
  vikten. Det gamla standardmålet (33 ml × trendvikt) sparades aldrig, så profiler utan eget mål får det nya
  automatiskt; eget mål lämnas orört (ingen DB-migrering). `waterTrainingBonus` → +500 ml dagar med ett
  genomfört pass (`waterGoal({ profile, workouts, date })`). Drycker i matloggen räknas in (`foodDrinkMl`:
  kategori `dryck`/`mjolk`/`fil` via `foodProfile`, ml = gram ÷ densitet; inte kvarg/keso/koncentrat och
  aldrig alkohol – `isAlcoholic`, bl.a. "vol. %"). `drinkEntries`/`drinkOn` används av Idag, Logga, historik,
  kalender, veckosummering och milstolpen `vatten-7`. `addWater` håller `createdAt` strikt växande per dag så att
  `undoLastWater` ("Ångra senaste") alltid tar dagens senaste post. Ring + snabbknappar (glas 250, flaska 500,
  kaffe/te 150 ml, "Valfri mängd" → Logga → Dryck) i Översikt → Idag med "Varav … från Mat"; Logga → Dryck listar
  även dryck från Mat; historik i Framsteg → Historik.
- **Träning**: pass (`Workout`) har datum, valfri tid (`HH:MM`, lokal), typ (förval + egna ur tidigare
  pass), längd, valfri intensitet/anteckning och status `planerad`/`genomford`/`hoppad`. Scheman
  (`WorkoutPlan`: veckodagar 0 = mån, tid, start/slut) genereras till pass vid visning
  (`workoutsBetween`) och sparas först när de besvaras, med id `<planId>:<datum>` som då ersätter det
  genererade. Ett planerat pass vars tid passerat (utan tid: när dagen är slut) är _obesvarat_ och
  visas i "Blev passet av?" överst på Översikt (`findUnanswered`, 28 dagar bakåt). Idag visar dagens
  pass (utom obesvarade) med Klar / Hoppa över; Klar öppnar `CompleteWorkoutSheet` med planens längd
  och intensitet förifyllda. Kommande = tre nästa planerade efter idag. Kalenderns dagsvy (`CalendarDay`) listar passen
  som rader: tryck = radmeny (Klar, Hoppade över, Markera som planerad, Ta bort passet), svep vänster = ta bort med Ångra. Prickar: genomfört fylld, planerat ring, obesvarat röd,
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
  "Logga vikt" (`?action=log-weight` → `#/logga/vikt`), "+250 ml (glas)" (`add-water`: loggas direkt,
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
  veckor med data under Framsteg → Veckor (`pastWeeks`; en `ListRow` per vecka, tryck = summeringen och "Fråga AI" i en panel). Trend = EMA vid veckans slut − dagen före veckan
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
- **Streckkodsskanner** (`BarcodeScanner`, gemensam för Mat, egna måltider och Tillskott): modal kameravy med
  getUserMedia (bakre kamera, `facingMode: environment`, 1920×1080 ideal) och BarcodeDetector var 150:e ms. Ficklampa
  (`applyConstraints({ advanced: [{ torch }] })`) och zoom visas bara när `getCapabilities()` har dem; tryck för fokus
  (`pointsOfInterest`/`single-shot`) när det stöds. Ljusnivån mäts var 700:e ms på en 32×24-bild (`scanner.ts`) → "Mörkt,
  tänd lampan?". Träff: strömmen stoppas, `haptic('success')`, bock i 600 ms, sedan `onEan`. Reserver: "Skriv in
  streckkod" (numeriskt, EAN-8/13-validering) och "Välj bild" (BarcodeDetector på `createImageBitmap`). Strömmen stoppas
  alltid när vyn stängs eller appen döljs. Uppslag (`barcodeLookup.ts`): lokalt först (egna/cachade livsmedel, måltider
  med `ean`, tillskott med `ean` – bara påslagna funktioner), sedan Open Food Facts. En kod som finns på det andra stället
  ger `BarcodeElsewhere` med länk (`#/logga/tillskott/ean/<kod>` resp. `#/mat/ean/<kod>`, som slår upp koden direkt).
  Ingen träff → `BarcodeNotFound`: "Lägg in med AI från etikett" / "Lägg in manuellt" (EAN förifylld och sparad) och
  länken "Bidra till Open Food Facts" (`/product/<ean>`).
- **Tillskott** (`supplements.ts`, bakom brytaren `tillskott`, av som standard): Logga → Tillskott (`SupplementsLog`):
  dagens chips, "Lägg till" (skanna, AI från etikett, manuellt) och "Mina tillskott" (tryck = formulär, svep = ta bort
  med Ångra). `SupplementForm`: namn, enhet (tablett, kapsel, droppe, ml, brustablett), mängd per dos, näringsämnen ur
  `SUPPLEMENT_NUTRIENTS` (vitaminer och mineraler i `NUTRIENTS`) med egen enhet; D-vitamin i µg eller IE med omräkning.
  Förifylls från Open Food Facts (`parseOffSupplement`: `<ämne>_serving` i gram → ämnets enhet) när värdena finns.
  AI-import (`aiLabel.ts`, `AiLabelImport`): prompten ber om ENDAST JSON `{ namn, enhet, mangdPerDos, naringsamnen:
[{ amne, mangd, enhet }] }`; svaret valideras (kodblock tolereras, okända ämnen hoppas över med varning, fel enhet och
  saknade fält ger fel), förhandsvisas och förs in i formuläret för rättning. Mat har samma import per 100 g
  (`parseFoodLabel` → `CustomFoodForm prefill`). Översikt: `SupplementsToday` (chips + "Alla tagna" med Ångra) efter Idag.
  Kalendern: markören `tillskott` ("2 av 3 tagna", bara dagar med något taget).
- **Näring** (Mat → Näring, `#/mat/naring`, `NutritionView`, `micronutrients.ts`): vitaminer och mineraler per dag eller
  snitt 7 dagar (per loggad dag), uppdelat på mat (Livsmedelsverkets värden via `partsOf`, även ingredienser i måltider)
  och tagna tillskott, som uppdelad `StatBar` mot RI. UL-varning (`UpperLimitWarnings`, `upperLimits.ts`) när mat +
  tillskott (eller bara tillskott för folsyra, magnesium, niacin) överstiger EFSA:s gräns, med de största bidragen; samma
  varning (kortare) överst på Översikt samma dag (`TodayUpperLimits`, läser livsmedel.json bara om något ätits). Notis om
  att egna/OFF-livsmedel saknar vitamindata och att totalen kan vara i underkant.
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
- **Mat → Dag** (`FoodDay`): datumrad (‹ › + osynligt datumfält över texten), `DaySummary` med kcal- och
  proteinstapel på en rad och makron som text; när summeringen scrollats bort (IntersectionObserver) visas en
  aria-dold minirad i den sticky toppen ovanför sökfältet. Sökfältet ("Sök och logga mat") och skannerikonen öppnar
  `FoodPicker` – helskärms-sheet med sök, flikarna Senaste/Favoriter/Måltider, streckkod (Open Food Facts, cache,
  "Skapa eget livsmedel") och sedan `FoodLogForm`. Samma `FoodPicker` (`mode.kind = 'ingredient'`, utan måltidsval
  och utan måltider i listorna) lägger till ingredienser i `MealBuilder`. Dagens mat (`MealSections`): ett
  hopfällbart kort per måltid (namn, antal poster, kcal, + som öppnar sheeten förvald till måltiden); pågående
  måltid (`currentMealSlot`, samma klockslag som `defaultMealSlot`) är utfälld vid start, en måltid man loggar i
  fälls ut; tomma måltider är en smal rad med bara +. Rader (`FoodEntryRow`): tryck = redigera i bottom sheet
  (mängd, enhet, måltid, Ta bort), svep vänster (pekarhändelser, `touch-action: pan-y`) = ta bort; båda ger
  `FoodToast` med Ångra (lägger tillbaka posten oförändrad). En loggad sparad måltid kan fällas ut till
  ingredienserna (`loggedMealIngredients`, skalade efter loggad mängd). Kcal-värden: klassen `kcal`
  (`nowrap`, `tabular-nums`).
  Svep höger på en rad växlar favorit (stjärna på raden och i redigerings-sheeten). Måltidskortets ⋯ (och ⋯ bredvid
  datumraden för hela dagen) öppnar en meny: "Spara som egen måltid" (`SaveMealForm`, namn "Frukost 26 sep", posterna
  med mängd och enhet – loggade måltider delas upp i ingredienser i gram; syns direkt under Måltider i sök-sheeten) och
  "Analysera" (`MealAnalysisView`).
- **Analys** (`mealAnalysis.ts`, `swaps.ts`, ingen AI, offline): energi och makron ur loggposterna; fiber, socker, salt,
  vitaminer och mineraler slås upp i Livsmedelsverkets data per `lv:`-id (även ingredienser i sparade måltider) –
  egna/OFF-livsmedel saknar dem (`coverage`, markeras med *). % av dagsmål (kcal, protein) och av RI. Nyckeltal:
  protein/100 kcal, fiber/1 000 kcal, andel av kalorimålet. Bytesförslag för de tre poster med mest energi: samma
  kategori (`foodProfile`, inte `ovrigt`/`sas`/`kryddor`/`maltid`), protein/100 kcal +3 g och ×1,3 eller fiber/100 kcal
  +1 g och ×1,5, energi för samma mängd högst +5 % och minst 40 %.
- **Fråga AI** (`AskAi`, `aiPrompt.ts`): kryssrutor (ålder/kön, längd/trendvikt, mål/takt, kcal-/proteinmål, dagens
  intag hittills – bara måltid, innehåll, matpreferenser, GLP-1 – av som standard och bara när funktionen är på),
  förhandsvisning, Dela (Web Share, `text`), Kopiera (toast), Öppna i ChatGPT/Claude (`?q=` om adressen ≤ 6 000 tecken,
  annars kopiera + startsidan). Appen gör inga anrop själv. Finns för måltid, dag och vecka (Framsteg → Veckor).
- **Livsmedel**: `livsmedel.json` har valfri sjunde kolumn (grupp, `""` = ingen) och åttonde (övriga näringsämnen i
  ordningen i filens `extra`, `null` = saknas; `pickExtraNutrients` matchar EuroFIR-kod eller namn och räknar om enheten).
  Livsmedelsverkets databas (CC BY 4.0 – källan visas i Inställningar → Om appen, `LivsmedelSource`) hämtas med
  `npm run livsmedel` (inkl. livsmedelsgrupp när API:t har den – `pickGroup`, förlåtande tolkning) och checkas in – workflowet `livsmedel.yml` gör det automatiskt när skriptet
  ändras, eller manuellt via Actions. Appen anropar aldrig Livsmedelsverket. Streckkoder:
  `BarcodeDetector` + kamera, annars manuell EAN. Okända koder slås upp i Open Food Facts
  (enda externa anropet, bara streckkoden skickas) och cachas i `foods`.
- **Grafer**: uPlot (`WeightChart`, `StepsChart`, `IntakeChart`). Färger läses från CSS-variabler
  (`--data-weight`/`--data-steps`/`--data-food`, `--chart-point`, `--chart-goal`, `--chart-dose`).
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
  `okand` med snabbval på bilden. Jämförelse (`SessionCompare`, helskärmspanel): två tillfällen, vinkel eller båda, sida vid sida/
  reglage, dagar och viktskillnad; "Första mot senaste" (förval, även `#/framsteg/bilder/jamfor`). Profilsida:
  Inställningar → Bilder.
- **Beständig lagring**: `requestPersistence()` vid start; status + knapp i Inställningar.

### Säkerhetskopiering och återställning

- **Export** (Inställningar → Säkerhetskopia): `readSnapshot()` → `createBackup()` → `shareOrDownload()`.
  Web Share API används om `navigator.canShare({ files })` är sant, annars laddas filen ner.
  `lastExportAt` sätts bara om filen faktiskt delades/laddades ner (inte vid avbruten delning).
- **Filformat** (`BACKUP_FORMAT = 'viktresan-backup'`, `BACKUP_VERSION = 10`):
  - Okrypterad zip: `backup.json` (format, version, exportedAt, profil, `weights`, `waist`, `steps`,
    `photoSessions`, bildmetadata med `file`, `sessionId`, `angle`, `foods`, `meals`, `foodLog`, `favorites`, `water`, `workouts`,
    `workoutPlans`, `medications`, `injections`, `symptoms`, `foodUnits`, `milestones`, `supplements`, `supplementLog`, `recipes`) + `photos/<id>.<ext>` (bilderna oförändrade, okomprimerat i zip:en).
  - Version 1 (kombinerade `measurements`) kan fortfarande importeras; den delas upp med
    `splitLegacyMeasurements`. Version 1–2 saknar mat och ger tomma matlistor; version 1–3 saknar
    vatten och träning och ger tomma listor; version 1–4 saknar GLP-1 och ger tomma listor; version 3–5
    har portioner i stället för enheter och uppgraderas med `upgradeFoodData`; version 1–6 saknar milstolpar
    (tom lista – efter importen markeras passerade milstolpar utan firande); version 1–7 saknar fototillfällen och
    grupperas med `groupLegacyPhotos` (vinkel "ej angiven"); version 1–8 saknar tillskott (tomma listor); version 1–9 saknar recept (tom lista). En bild vars `sessionId` saknas bland tillfällena avvisas.
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
- Mobile-first CSS i `src/index.css` med tokens (docs/DESIGN.md): `--space-1…6` (4/8/12/16/24/32),
  fem textstorlekar `--text-xs…xl`, `--radius-*`, `--shadow-*`, semantiska `--success/--warning/--danger`
  och en färg per datatyp `--data-weight|food|drink|steps|training|dose|waist|mood` (grafer, kalender,
  ikoner, ringar). Ljust/mörkt tema följer `prefers-color-scheme`. Tryckytor minst 44 px (`--tap-min`),
  standard 56 px (`--tap`). En primärknapp per vy, inga Redigera/Ta bort-knappar i listor (tryck/svep +
  Toast med Ångra), inget kort-i-kort, inga radbrytningar i siffror (`.num`/`.nowrap`).
- Tillgänglighet: semantiska element, `aria-current` i navigeringen, fokus flyttas till
  sidrubriken vid sidbyte.
- Tester: enhetstester bredvid koden (`*.test.ts[x]`), e2e i `e2e/`. Testnamn på svenska.

## CI/CD

- `.github/workflows/ci.yml` (PR): lint, typecheck, vitest, bygg; Playwright (Pixel 7);
  Lighthouse CI (`@lhci/cli@0.13.0` = Lighthouse 11, den sista med PWA-kategorin) med krav på
  installerbar PWA (`installable-manifest`, `categories:pwa`) och tillgänglighet ≥ 0,9. Rapporten
  sparas som artefakt (`target: filesystem` – inget laddas upp till tredje part).
- `visual` (PR): `npm run test:visual` i containern `mcr.microsoft.com/playwright:v1.63.0-noble` (samma
  avbild som baslinjerna togs i); skillnaderna laddas upp som artefakt vid fel. `test:e2e` kör bara
  projektet `Pixel 7`.
- Playwright-kvalitetstester: `e2e/a11y.spec.ts` (axe, WCAG 2.2 AA + best practice, ljust och
  mörkt tema), `e2e/offline.spec.ts` (flygplansläge efter första laddningen, även ny flik), och
  `Page.getInstallabilityErrors` via CDP i `e2e/app.spec.ts`.
- `.github/workflows/deploy.yml` (push till `main`): bygger och publicerar `dist/` via
  `actions/deploy-pages`. Kräver att Pages-källan är satt till "GitHub Actions" i repots
  inställningar.
