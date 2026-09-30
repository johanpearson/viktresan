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
| `npm run fineli`             | Hämtar Finelis öppna data → `public/fineli.json`.               |

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
src/lib/navigation.ts   Historiken/bakåtknappen: stackregler (chainFor, planNavigation), navigate(), useOverlay() för paneler
                        och dialoger, consumeSubPath(), "Kasta ändringar?" (DiscardPrompt), omladdning/lås (abandonOverlays)
src/lib/features.ts     Funktionsbrytare: FEATURES, useFeatures() (filter/isEnabled), lagras i settings
src/lib/preferences.ts  Visningsinställningar per enhet (trendHero, stängt veckokort, profilsida, spökbild), usePreferences()
src/lib/shortcuts.ts    Genvägar på appikonen: SHORTCUTS (även manifestet), ?action= → åtgärd
src/lib/useShortcut.ts  Kör genvägen vid start: öppna panel, +250 ml med Ångra, erbjud att slå på funktion
src/lib/protein.ts      Proteinmål (faktor × målvikt)
src/lib/fiber.ts        Fibermål (NNR 2023, upptrappning 3 g/vecka), fiber per dag ur matloggen,
                        fiber i matloggningen (fiberForItem per mängd, fiberSum, FiberAmount: null = "–", partial = "*"), formatMacroG
src/lib/useFiber.ts     Hook: fibermålet + fiber per dag (läser livsmedel.json/egna livsmedel bara när målet visas), sparar trappans start
src/data/fiberReference.ts  Referensvärden för fiber (35 g män, 25 g kvinnor, 30 g utan kön) med källa (NNR 2023)
src/lib/milestones.ts   Milstolpar: regler (trendvikt), evaluateMilestones, kommande, diffMilestones, texter
src/lib/milestoneSync.ts  Milstolpar mot databasen: syncMilestones('silent' | 'live'), köade körningar
src/lib/celebration.ts  Kö med firanden (useCelebration); confetti.ts = canvas-confetti utan worker
src/lib/plateau.ts      Platå: regeln (takt > 0, ≥ 4 v sedan start, ≥ 70 % vägda dagar, trend < 0,2 kg på 21 d), vilotid 14 d,
                        jämförelse 3 v mot 3 v innan (intag, loggade dagar, steg, pass, dos, TDEE) och förklaringar
src/lib/report.ts       Rapport: perioder, sektioner (med funktion), inställningar (preferences.report), buildReport per period
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
src/lib/overview.ts     Översikts nyckeltal på en gemensam viktkälla (trend eller dag): overviewStats; goalEta = en enda
                        måldatumsuppgift (trendprognos, annars "enligt plan" med vald takt)
src/lib/overviewItems.ts  Ringar och kort som kan döljas på Översikt (OVERVIEW_ITEMS, preferences.overviewHidden)
src/lib/todo.ts         Översikt → Att göra idag: buildTodo (tillskott, dos, pass, obesvarade, backup) + raden Nästa dos
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
src/lib/recipeImport.ts Receptimport: prompt (länk/text/bild), JSON-validering, ingredienstolkning ("1 burk … (400 g)"), mängd i gram
                        med enhetssystemet (resolveAmount), matchning (matchFood) och säkerhetsnivå (hög/osäker/ingen)
src/lib/matchMemory.ts  Minnet av manuella matchningar i receptimporten (settings `ingredientMatches`: text → livsmedels-id)
src/lib/shareTarget.ts  Web Share Target: manifestets parametrar (SHARE_PARAMS), tolkning av delad länk/text, väntande delning
src/lib/useIngredients.ts  Hook: ingrediensrader för egna måltider och recept (IngredientEditor)
src/lib/weekBudget.ts   Veckoraden: 7 × dagsmål, kvar, per dag resten av veckan (golvspärr), saldo, dagar (ej loggad = 0 kcal)
src/lib/suggestions.ts  Föreslå (Mat): gap (protein/fiber kvar), kandidater (historik 28 d, favoriter, måltider, recept, startlistan),
                        typisk mängd (median av loggar som huvudkomponent), proteinportioner (0,5–2 ×, minsta portion per kategori),
                        kompletterande kombinationer, poäng (näring ≥ 70 %, vana ≤ 20 %), variation, förklaringar och texter
src/data/suggestions.ts Startlistan för Föreslå (~40 livsmedel `lv:`/`fi:` med standardportion och måltider, reservvärden)
src/lib/swaps.ts        Bytesförslag: samma kategori, klart bättre protein/kcal eller fiber, aldrig mer energi
src/lib/aiPrompt.ts     "Fråga AI": kryssrutor (AI_OPTIONS), underlag (aiContextFrom), promptbyggare, ChatGPT-/Claude-länkar
src/lib/aiPromptTemplate.ts  Promptmallen på svenska ({{amne}}, {{amneKort}}, {{underlag}}, {{kalorigolv}}) – redigera här
src/data/nutritionClaims.ts  Näringsetiketternas regler med källa (EU 1924/2006): Proteinrik, Fiberrik, Energisnål (CLAIM_RULES)
src/lib/claims.ts       Etikettreglerna (isProteinRich/isFiberRich/isLowEnergy), underlag per livsmedel/måltid/recept (claimFactsFor)
src/lib/foodNutrition.ts  Näringsvärdenas status (kcal, P, K, F, fiber, socker; saknas/källa/eget), egna värden ovanpå källan
                        (applyOverride/withoutOverride, mergeOverride), uppdatering av tidigare loggposter (logEntriesToUpdate)
src/data/nutrients.ts   Övriga näringsämnen: nyckel, enhet, RI (EU 1169/2011; fiber NNR), EuroFIR-kod/namn för importen
src/lib/units.ts        Enheter: volym via densitet, kategori (foodProfile), relevanta enheter, gissningar, förval, OFF-portion/förpackning
src/data/units.ts       Kuraterad tabell per livsmedel (Livsmedelsverket): styckvikter, egen densitet/kategori (ungefärliga)
src/data/foodCategories.ts  Kategorier: densitet, relevanta enheter, gissade styckvikter; namnmönster + Livsmedelsverkets grupper
src/data/fineliCategories.ts  Finelis användningsklasser (FUCLASS) → kategorier (FINELI_CLASSES)
src/lib/foodSearch.ts   FoodItem + fuzzy-sökning (å/ä/ö-vikning, Damerau-Levenshtein) i alla källor: källordning (SOURCE_RANK),
                        deduplicering (dedupeKey/isDuplicate), korta källetiketter (SOURCE_TAGS: LV, Fineli, OFF, Egen)
src/lib/foodCatalog.ts  Lagrat → FoodItem, snabbval (senaste, favoriter)
src/lib/livsmedel.ts    Laddar/tolkar public/livsmedel.json och public/fineli.json (format i livsmedelFormat.ts) och slår ihop dem
                        (mergeDatabases; `databases` = källorna för Om appen)
src/lib/livsmedelImport.ts  Ren omvandling av Livsmedelsverkets API-svar (används av skriptet); toCompactFile/serializeCompactFile delas
src/lib/fineliImport.ts Ren omvandling av Finelis CSV-paket (svenska namn, kJ → kcal, enheter) till samma kompakta format
src/lib/barcode.ts      EAN-validering + Open Food Facts-uppslag (injicerbar fetch), tillskott per portion, bidragslänk
src/lib/barcodeDetector.ts  Typning/fabrik för BarcodeDetector
src/lib/barcodeLookup.ts  Uppslag av en skannad kod: lokalt (livsmedel, måltider, tillskott) före OFF, korsträff Mat/Tillskott
src/lib/scanner.ts      Skannerns kameralogik: ljusnivå (luma, hysteres), ficklampa/zoom/fokus ur capabilities
src/lib/aiLabel.ts      "Lägg in med AI från etikett": prompter och JSON-validering (tillskott per dos, livsmedel per 100 g med
                        valfri fiber, socker och portion)
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
src/db/db.ts            IndexedDB via idb: schema, migreringar, dataåtkomst, onDataChange (DB_VERSION 13)
src/components/         Delade komponenter (NavBar, Page, WeightChart, StepsChart, ExportBackup,
                        ImportBackup, TodoCard, LockGate, LockSettings …). Designsystemet (docs/DESIGN.md):
                        Page (sticky rubrik som krymper), Card, ListRow, SectionAccordion, BottomSheet,
                        SegmentedControl, StatBar, GoalRing, ProgressBar, EmptyState, Toast, Skeleton,
                        ActionSheet (radmeny ovanpå en panel), DateBar (‹ Idag ›, även i Logga-panelernas formulär),
                        RingRow (rad ringar: samma textstorlek, krymps så att texten ryms i ringen – useRingFit/ringFit.ts),
                        StorageSettings (Inställningar → Lagring), ShowMore (+ useShowMore: 14 rader, sedan fler),
                        RangeFilter (tidsfilter som chips), DailyBarChart (staplar per dag: steg, dryck),
                        PeriodBar (‹ månad/vecka ›), Disclosure (hopfälld hjälptext), Parts (bryts bara vid "·"),
                        ChoiceList (valrader i stället för radioknappar), ChipGroup (val som chips),
                        Macros ("P 6 g · K 30 g · F 2 g · Fi 4 g" i matloggningen), DiscardPrompt ("Kasta ändringar?")
src/lib/useSwipe.ts     Svep med pekarhändelser (ListRow): vänster = ta bort, höger = t.ex. favorit
src/lib/useUndoToast.ts Toast med Ångra efter borttagning i en lista (Logga-panelerna)
src/lib/tones.ts        Färgtoner per datatyp (`tone-food` → `--tone`) för staplar och ringar
src/lib/haptics.ts      haptic('success' | 'light') via navigator.vibrate (inställning + reducerad rörelse)
src/lib/motion.ts       prefersReducedMotion()
docs/DESIGN.md          Designsystemet: tokens, komponenter, regler, mikrointeraktioner
docs/ui-audit.md        UI-granskningen per vy med prioritet och ordning för kvarvarande vyer
src/pages/              En komponent per sektion: Översikt, Logga (rutnät → bottom sheet), Mat
                        (Dag | Egna | Historik | Näring som segment i rubriken; `#/mat/logga` = sök-sheeten, `#/mat/importera` = receptimporten), Kalender (Månad | Vecka i rubriken, förklaringen hopfälld,
                        dagsvyn = CalendarDay), Framsteg (Historik | Veckor | Bilder | Milstolpar | Rapport; `Rapport.tsx`), Inställningar
e2e/                    Playwright-tester. mealHeaders.spec.ts = måltidsrubrikernas rutnät (pil, namn, kcal i samma kolumn i alla
                        sektioner på 412 och 360 px, ingen radbrytning, tryckyta) med MEAL_HEADERS. overview.spec.ts = Översikt med fast data (höjd ≤ 1,5 skärmar, varje ring/kort navigerar rätt,
                        Att göra idag → "Allt klart", en enda prognostext). navigation.spec.ts = bakåtknappen med page.goBack() (standalone via matchMedia,
                        flikar, paneler, undervy, skanner + kameraspår, genväg, "Kasta ändringar?", omladdning). suggestions.spec.ts = Föreslå
                        med fast historik (15:30 = mellanmål, page.clock): rubrik med gapen, förklaring, under kvarvarande kcal, logga + Ångra, ⋯ på tom måltid, Justera,
                        kallstart, Inte intresserad + återställning, lågt läge, Något nytt och axe. recipeImport.spec.ts = receptimporten (delning via
                        `?share-text=…`, AI-svar, lös osäker/ingen träff i sök-sheeten, matchningsminnet, logga 1 portion). fiberLogging.spec.ts mockar livsmedel.json (med och utan fiber) och kontrollerar
                        fiber i sheet, rad och summor ("–", "*"). fiber.spec.ts styr tiden med page.clock (GLP-1 → fiberring, dryckesmål, diarré). fineli.spec.ts = sökträff från den bundlade
                        Fineli-filen (etikett, loggning), källan i Om appen och deduplicering med mockade filer; specar som mockar
                        livsmedel.json mockar också en tom fineli.json så att resultaten inte beror på Finelis data. nutritionData.spec.ts = skannad vara utan fiber (mockad OFF) → Komplettera
                        → uppdatera tidigare logg → skanna igen (eget värde, Fiberrik), filter Proteinrik och dolda etiketter. supplements.spec.ts mockar getUserMedia (spår med/utan torch/zoom),
                        BarcodeDetector (kod via `window.__ean`) och OFF. rings.spec.ts = ringarnas text inom den inre cirkeln
                        med värsta fallets värden (WORST_CASE_RINGS) på 412 och 360 px. visual.spec.ts + visualData.ts = visuella regressionstester (egen
                        Playwright-projekt `visual`, fryst datum, fast data, baslinjer i e2e/__screenshots__). Övriga (inkl. axe, offline, backup, lås, mat, träning, GLP-1, genvägar,
                        veckokort, milstolpar, bilder, måltidsanalys, rapport, platå); hjälpare i helpers.ts. report.spec.ts
                        ersätter window.print (addInitScript) och räknar anropen; plateau.spec.ts styr tiden med page.clock. mealAnalysis.spec.ts mockar
                        clipboard, navigator.share och window.open (addInitScript). photos.spec.ts mockar getUserMedia
                        (nekad resp. canvas-ström) och skapar en v8-databas för migreringen. week.spec.ts styr tiden med page.clock. training.spec.ts och glp1.spec.ts styr tiden med page.clock.setFixedTime.
                        food.spec.ts blockerar service workern och mockar livsmedel.json,
                        Open Food Facts (page.route) och BarcodeDetector/kamera (addInitScript); svep görs med
                        dispatchEvent('pointer…') (`swipeLeft` i helpers.ts) och pågående måltid styrs med page.clock.setFixedTime
lighthouserc.json       Lighthouse CI-krav: installerbar PWA, tillgänglighet ≥ 0,9
scripts/                Engångsskript (ikongenerering inkl. genvägsikoner shortcut-*.svg, fetch-livsmedel.ts, fetch-fineli.ts)
public/livsmedel.json   Livsmedelsverkets data, kompakt (en rad per livsmedel), precachad
public/fineli.json      Finelis data (THL), samma format, id:n `fi:<FOODID>`, grupp = användningsklass, precachad
```

- **Routing** är hash-baserad (`#/logga`) – GitHub Pages saknar SPA-fallback och det
  fungerar offline utan serverstöd. Ny sida: lägg till i `ROUTES` + `PAGES` i `App.tsx`.
  Bottennavigeringen: Översikt, Logga, Mat, Kalender, Framsteg (routes med `inNav: true`,
  filtrerade på funktioner); Inställningar nås via kugghjulet i Översikts rubrikrad. Inställningar är
  grupperade rader (`GROUPS` i `Installningar.tsx`, med `feature`) som öppnar en panel; `#/installningar/<panel>`
  (`profil`, `protein`, `fiber`, `dryck`, `matpreferenser`, `funktioner`, `visning`, `oversikt`, `bilder`, `las`, `sakerhetskopia`,
  `lagring`, `om`) öppnar panelen direkt.
  Flikar i Framsteg har egen delsökväg (`#/framsteg/bilder`). Gamla `#/historik`, `#/bilder`
  och `#/steg` skickas vidare (`MOVED`). En route för en avstängd funktion visar Översikt.
- **Bakåtknappen** (`navigation.ts`, all historik går därigenom – inga egna `pushState`/`location.hash =`): historiken
  speglar hierarkin Översikt (rot, djup 0) → flik (1) → undervy (2, `Route.subviews`, t.ex. `rapport/visa`) → överlägg.
  Interna länkar (`href="#/…"`) fångas globalt och går till `navigate()`: flikbyte från Översikt = ny post, mellan andra
  flikar (och Framstegs flikar) = ersätt, Översikt = tillbaka till roten. Bakåt på Översikt lämnar appen. Postens
  `history.state.viktresanNav` = `{ depth, page }`. Överlägg (`BottomSheet`, skanner, kamera, bildvisning, firande) anropar
  `useOverlay(close)`: ny post med samma adress, popstate stänger; stängs de på annat sätt (knapp, svep, sparat) tas posten
  bort med `history.go(-n)` (samlat i en mikrouppgift; ett överlägg som öppnas direkt efter tar över posten). Nästlade
  överlägg får nivå via `OverlayLevel`. En delsökväg som öppnar en panel (`#/logga/vikt`, `#/mat/logga`, `#/mat/ean/…`,
  `#/installningar/<panel>`, `#/framsteg/bilder/jamfor`) konsumeras av sidan (`consumeSubPath`): sidans post blir
  `#/logga` och panelens post behåller delsökvägen. Djuplänk/genväg vid start: posten blir `#/` och målet läggs ovanpå.
  Omladdning (ny version) och lås lägger inga poster: överläggens poster blir lediga platser som en panel som öppnas igen
  tar över, annars tas de bort efter 2 s (`pruneOrphansSoon` när `App` monteras). Osparade ändringar: `BottomSheet`
  följer `input`/`change` i sina formulär (inte sökfält/filval) tills `submit`; bakåt (eller Esc) ger då "Kasta ändringar?".
- **Funktionsbrytare** (`features.ts`, Inställningar → Funktioner): steg, midja, mat, vatten,
  träning, glp1, tillskott, bilder. Lagras i `settings` under `features` med `version` (`FLAGS_VERSION`);
  lagrade värden för en funktion från före dess `availableSince` ignoreras (de var alltid "av"). Avstängd = dold överallt, datan
  ligger kvar och exporteras. Inga spridda if-satser: listor av vyer/flikar/rutor/markörer har
  ett `feature`-fält och filtreras med `useFeatures().filter(...)`; enstaka delar lindas i
  `<Feature id="…">`. GLP-1 är av som standard (`availableSince: 3`); Tillskott också (`availableSince: 4`, `FLAGS_VERSION = 4`). En ny
  kommande funktion får `available: false` tills den byggs – sätt då `availableSince` och höj `FLAGS_VERSION`.
- **Data**: `src/db/db.ts` är enda stället som pratar med IndexedDB (`DB_VERSION = 13`). Object stores:
  `weights` (vikt + valfri anteckning, flera per dag, index `by-date`),
  `waist` (v3, midjemått, nyckel = `date`, ett per dag), `steps` (v3, steg, nyckel = `date`, ett per dag),
  `photos` (komprimerad Blob, `sessionId`, `angle` `fram`/`profil`/`okand`, `side` för profil, mått; index `by-date`,
  `by-session` (v9); `date` = kopia av tillfällets datum), `photoSessions` (v9, fototillfällen `{ id, date, weightKg?, note? }`,
  index `by-date`), `settings` (key/value), `profile` (v2, nyckel `current`),
  `foods` (v4, egna livsmedel `egen:<uuid>` + cachade Open Food Facts-träffar `off:<ean>`, index `by-ean`; valfri
  `fiberG` per 100 g utan schemaändring – OFF `fiber_100g` eller ifyllt i eget livsmedel),
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
  `recept:<id>`; valfri `sourceUrl` från receptimporten utan schemaändring), `foodOverrides` (v13, egna näringsvärden per
  livsmedel från OFF/Livsmedelsverket/Fineli, nyckel = `foodId`, valfri `ean`, `values` = kcal/proteinG/carbsG/fatG/fiberG/sugarG
  per 100 g/ml; `putFoodOverride` utan värden tar bort posten). `StoredFood` har utan schemaändring valfria `sugarG` och
  `missing` (makron som saknades i OFF och sparades som 0). Matloggposter har sedan v11 (utan datamigrering) valfria `estimated: true` (snabblogg: 1 portion = 100 "g",
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
  (Inställningar → Matpreferenser, fritext ≤ 1 000 tecken, bara för "Fråga AI"; ingen schemaändring) samt fibermålet (`showFiberGoal`, `fiberRamp: false` =
  direkt på referensvärdet, `fiberRampStart` `{ date, startG }`) och GLP-1-dryckestillägget (`waterGlp1BonusMl` 0–1 000,
  saknas = 500, `waterGlp1OnOwnGoal`) – Inställningar → Fibermål/Dryckesmål, ingen schemaändring, följer med i säkerhetskopian.
  Migreringen v11 → v12 (`migrateToV12`) tar bort profilens `calorieMode` (den borttagna inställningen Dag/Vecka);
  säkerhetskopior version 10 med fältet importeras utan det.
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
  `ghostEnabled`, `ghostOpacity`, `aiOptions` – kryssrutorna i "Fråga AI", `haptics` – vibration vid spara,
  `plateauDismissed` – dagen platåkortet stängdes, `report` – rapportens period och sektioner, `reportPrintHintSeen`, `overviewHidden` – dolda ringar/kort på Översikt, `milestoneCardDismissed`, `claimsHidden` – dolda näringsetiketter, `suggestionsHidden` – förslag i Föreslå som inte är intressanta), `ingredientMatches` (receptimportens minne: normaliserad ingredienstext → livsmedels-id, högst 500). Inställningar ingår inte i säkerhetskopior – de är knutna till enheten.
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
- **Dag och vecka** (`weekBudget.ts`, alltid båda – ingen inställning): dagsmålet (planen) är primärt – kcal-ringen på
  Översikt → Idag och kcal-stapeln i Mat → Dag visar dagens intag mot det. Under ringen/makroraden står veckoraden
  (`WeekBudgetRow`, samma korta rad på Översikt och i Mat → Dag): "Vecka: [X] kcal kvar · ≈ [Y]/dag" (mån–sön); saldot
  ("Saldo hittills ±N kcal" = loggat − dagsmålet för dagarna före idag, neutral färg) finns i panelen. Y = (budget − intag före idag) /
  dagar kvar inkl. idag, så det står still under dagen. Dagar utan matlogg räknas som 0 kcal. Y går aldrig under golvet
  (`floorKcal`); räcker inte budgeten (resten av veckan på golvet går över budgeten) visas i panelen `WeekShortfallNote`
  ("Veckobudgeten är överskriden med X kcal" / "räcker inte till kalorigolvet") med förslag att sprida resten över nästa
  vecka. Tryck på raden = `WeekBudgetSheet`: sju staplar mot dagsmålet (streckad linje), "ej loggad", kvar, per dag och
  saldo. Mat → Dag visar veckan för det valda datumet (en avslutad vecka: bara kvar/över). Veckosummeringen har raden
  `budget` (budget mot utfall) när det finns ett kalorimål.
- **Receptimport** (`recipeImport.ts`, `RecipeImport`, `RecipeImportReview`): ingångar Mat → Egna → Recept → raden
  "Importera recept" och delningsmenyn (Web Share Target, `shareTarget.ts`): manifestets `share_target` (GET, action = appens
  bas) öppnar appen med `?share-title=…&share-text=…&share-url=…`; `useShortcut` läser dem en gång, tar bort dem ur adressen,
  sparar delningen (`setPendingShare`) och navigerar till `#/mat/importera` (Egna + importpanelen, förifylld med länken –
  även en länk i `share-text` – annars texten). Avstängd Mat → toast med "Slå på Mat". AI-steget = `AiJsonImport` (samma
  komponent som "Lägg in med AI från etikett"): prompten ber AI-tjänsten läsa länken/texten/bilden och svara ENDAST med JSON
  `{ namn, portioner, ingredienser: [{ original, mangd, enhet, livsmedel }], kallaUrl? }`; `parseRecipeImport` validerar
  (kodblock tolereras, "1/2" och "0,5" som text, saknade portioner/ogiltig källa = varning). **Appen anropar aldrig
  receptsajten.** Granskning: en rad per ingrediens (originaltext, föreslaget livsmedel, gram, kcal, `tag-confidence-*`).
  Mängd: AI-tjänstens mängd/enhet, vikt inom parentes i originaltexten går före en burk/förpackning; gram direkt, volym via
  densitet (`foodProfile`, saknas den: 1 g/ml och osäker), styck och andra enheter ur `unitsFor` (gissning = osäker).
  Matchning: minnet först (säker), sedan fuzzy-sökning bland egna livsmedel (inkl. cachade OFF) och Livsmedelsverkets –
  hela namnet, sedan delar; säker = alla ord finns som hela ord och högst två ord till. Fineli ingår bland kandidaterna.
  Tryck på en rad = sök-sheeten (`FoodPicker` med `title`, `initialQuery`, `initialUsage`, skanner); salt/peppar/vatten/
  "efter smak" (`isSkippable`) och rader utan träff har chipet "Hoppa över". Spara = vanligt recept med portioner och
  `sourceUrl`; manuella val sparas i matchningsminnet. Källan visas som länk i receptet (`RecipeBuilder`, `recipe-source`).
- **Snabblogg och recept**: sök-sheeten har raden "Snabblogg" (`QuickLogForm`); snabbval under Senaste/Favoriter
  ("≈ 700 kcal") öppnar den förifylld. Recept (Mat → Egna, `RecipeBuilder`) söks och listas under Måltider i sök-sheeten,
  loggas i portioner (½, 1, 1½, 2) eller gram och kan dupliceras.
- **Dryck** (i UI:t "Dryck"; internt heter det fortfarande `water`/`vatten` – store, funktion, route
  `#/logga/vatten`): mål = eget `waterGoalMl`, annars standardmål efter kön: 2 000 ml (man) / 1 600 ml
  (kvinna), 1 800 ml utan kön – dryckesdelen (~80 %) av EFSA:s totala vätskeintag. Ingen koppling till
  vikten. Det gamla standardmålet (33 ml × trendvikt) sparades aldrig, så profiler utan eget mål får det nya
  automatiskt; eget mål lämnas orört (ingen DB-migrering). `waterTrainingBonus` → +500 ml dagar med ett
  genomfört pass (`waterGoal({ profile, workouts, date, glp1 })`). Med GLP-1 på: +`waterGlp1BonusMl` (standard 500 ml,
  0–1 000 i steg om 100) på standardmålet, med kort förklaring (`GLP1_WATER_REASON`, `DrinkGoalNote`); ett eget mål får
  tillägget bara med `waterGlp1OnOwnGoal` (`glp1WaterBonusMl`). Milstolpen `vatten-7` räknar utan GLP-1-tillägget. Drycker i matloggen räknas in (`foodDrinkMl`:
  kategori `dryck`/`mjolk`/`fil` via `foodProfile`, ml = gram ÷ densitet; inte kvarg/keso/koncentrat och
  aldrig alkohol – `isAlcoholic`, bl.a. "vol. %"). `drinkEntries`/`drinkOn` används av Idag, Logga, historik,
  kalender, veckosummering och milstolpen `vatten-7`. `addWater` håller `createdAt` strikt växande per dag så att
  `undoLastWater` ("Ångra senaste") alltid tar dagens senaste post. Ringarna visar liter med en decimal ("1,8 l", "av 2,5");
  exakta ml i panelen, historiken och för skärmläsare. Ring i Översikt → Idag; tryck = panel med
  snabbknappar (glas 250, flaska 500, kaffe/te 150 ml, valfri mängd, Ångra senaste) och "Varav … från Mat"; Logga → Dryck listar
  även dryck från Mat; historik i Framsteg → Historik.
- **Träning**: pass (`Workout`) har datum, valfri tid (`HH:MM`, lokal), typ (förval + egna ur tidigare
  pass), längd, valfri intensitet/anteckning och status `planerad`/`genomford`/`hoppad`. Scheman
  (`WorkoutPlan`: veckodagar 0 = mån, tid, start/slut) genereras till pass vid visning
  (`workoutsBetween`) och sparas först när de besvaras, med id `<planId>:<datum>` som då ersätter det
  genererade. Ett planerat pass vars tid passerat (utan tid: när dagen är slut) är _obesvarat_ och
  visas som "Blev passet av?" i Översikt → Att göra idag (`findUnanswered`, 28 dagar bakåt). Att göra idag visar
  dagens planerade pass med Klar / Hoppa över; Klar öppnar `CompleteWorkoutSheet` med planens längd
  och intensitet förifyllda. Genomförda pass idag = chip i Idag. Översikt har inget "Kommande". Kalenderns dagsvy (`CalendarDay`) listar passen
  som rader: tryck = radmeny (Klar, Hoppade över, Markera som planerad, Ta bort passet), svep vänster = ta bort med Ångra. Prickar: genomfört fylld, planerat ring, obesvarat röd,
  hoppat grå fyrkant (`DayMarker.dots`).
- **GLP-1** (`glp1.ts`, bakom brytaren `glp1`): `Medication` har namn (förval Wegovy/Ozempic/Mounjaro/
  Saxenda + fritext), `frequency` `vecka` (med `weekday`, 0 = mån) eller `dag`, tid och en dostrappa
  (`steps`: datum + dos i mg, inmatad av användaren). Schemat börjar vid första steget; dosen ett datum
  = senaste steget på/före datumet. **Appen föreslår aldrig doser** – förifyllt värde kommer bara ur
  trappan (annars senast loggade dos) och `PRESCRIBER_NOTE` visas där doser läggs in. En veckodos räknas
  som tagen om en injektion av läkemedlet loggas inom ±3 dagar (dagsdos: samma dag). Planerade doser
  visas från idag (`dosesBetween`); `dueToday` ger raden "Dos idag" i Översikt → Att göra idag och `nextDose`
  annars raden "Nästa dos lör 26 sep · 2,5 mg · buk vänster" längst ner (länk till `#/logga/glp1`, som öppnar panelen
  direkt; `NextDoseCard` under Dos visar nästa steg, senaste dos och ställe). Injektionsställe: `suggestSite` = oanvänt
  ställe i rotationsordning, annars det som använts längst tillbaka. Injektioner kopierar in
  läkemedlets namn. `doseChanges` (start + byte av dos/läkemedel) ritas som streckade linjer i
  viktgrafen (`WeightChart` `markers`, färg `--chart-dose`) och listas i Framsteg → Historik.
  Kalendern: romb-prick, fylld = loggad, kontur = planerad; `maende`-markören visar aptit/biverkningar.
  Diarré eller kräkning loggad idag (`fluidLossSideEffects`) → `HydrationReminder` (Card, `warning`) på Översikt med en
  saklig uppmaning att dricka extra. Den höjer aldrig dryckesmålet.
- **Genvägar** (`shortcuts.ts`, manifestets `shortcuts` byggs från samma lista i vite.config.ts):
  "Logga vikt" (`?action=log-weight` → `#/logga/vikt`), "+250 ml (glas)" (`add-water`: loggas direkt,
  Översikt + toast med Ångra) och "Logga mat" (`log-food` → `#/mat/logga`). `useShortcut` i `App` läser
  `?action=` en gång när brytarna är lästa och tar bort den ur adressen (omladdning kör inte om). Avstängd
  funktion → toast med "Slå på …" som slår på den och kör genvägen. Ikoner: `public/shortcut-*-96x96.png`.
- **Protein** (`protein.ts`): mål = `proteinFactor` (profil, 1,2–2,0 i steg om 0,1, saknas → 1,6) × målvikt.
  Ringar för kalorier och protein i Översikt → Idag (`RingAction`: kalorier → panelen `CalorieDetails` med mål,
  takt, förbrukning/adaptiv TDEE och "Så räknas målet ut"; protein och fiber → Mat → Näring, kortet "Protein och fiber"),
  StatBar i Mat → Dag; proteinkolumn och
  snitt i Mat → Historik.
- **Fibermål** (`fiber.ts`, `useFiber`, `data/fiberReference.ts`): referensvärde NNR 2023, 35 g (man) / 25 g (kvinna) /
  30 g utan kön. Visas automatiskt när GLP-1 är på, annars med `profile.showFiberGoal` (Inställningar → Fibermål, bakom
  `mat`). Gradvis upptrappning (på som standard): start = snitt av de senaste 7 loggade dagarna med fiber före idag
  (`rampStartG`, 15 g utan data, högst referensvärdet), +3 g per hel vecka (`weeklyFiberGoalG`) tills referensvärdet nås;
  starten sparas i profilen första gången målet visas (`useFiber` → `saveRampStart`). "Veckans fibermål: X g (mål Y g)"
  (`FiberNote`). Av/på i inställningen börjar om trappan. Fiber per post via `partsOf` + uppslag: Livsmedelsverket
  (`extra.fiberG`), egna/OFF (`StoredFood.fiberG`); snabbloggar och poster utan värde räknas inte (`missingEntries` →
  "Dagens fiber kan vara i underkant"). Visas som fjärde ring på Översikt → Idag (`rings-4`; `FiberNote` med veckans mål och saknad fiberdata i Mat → Näring), `StatBar` i Mat → Dag (kalorier
  överst, protein + fiber under), kolumn och snitt i Mat → Historik, raden `fiber` i veckosummeringen, "Mål" i rapportens
  kost och "Andel av dagens fibermål" i analysen.
  **Fiber i matloggningen** visas alltid (oberoende av fibermålet) bredvid makrona med `Macros` i fiberns färg
  (`--macro-fiber`): logg-sheetens näringsrad (`log-macros`, vald mängd och enhet) och detaljer (per 100 g och per
  första enheten), sökträffar/Senaste/Favoriter (per enhet eller 100 g), raderna, måltidens rubrik (`SectionAccordion`
  `detail`), dagens makrorad, egna måltider och recept (per portion och 100 g) och Egna livsmedel. Fiberkällan byggs ur
  katalogen (`catalogFiberSource`) när Livsmedelsverkets data är laddad – innan dess utelämnas fibern. Saknas fiberdata:
  "–" (inte 0) och posten räknas inte in; en summa där någon post saknar fiber får "*", och dagens fibervärde (Mat → Dag,
  Mat → Näring) en info-ikon (`InfoButton`) som fäller ut förklaringen (`FiberMissingNote`). Makron och fiber i korta rader
  (`formatMacroG`): alltid en decimal under 10 g ("6,0 g"), hela gram från 10 g.
- **Översikt** (docs/DESIGN.md → Översikt): viktkortet (tryck = Framsteg → Historik), kontextkort när de är aktuella
  (`UpdateCard` – toast på övriga sidor, `MilestoneCard` – nådd senaste 7 dagarna, `preferences.milestoneCardDismissed`,
  veckokortet, platån, dryckespåminnelse, övre gränsvärden), Idag (ringar, chips för steg/träning, kort veckorad) och
  `TodoCard` (Att göra idag / "Allt klart för idag"). Inställningar → Översikt döljer ringar och kort. En vanlig dag ryms
  på ~1,5 skärmhöjder (`e2e/overview.spec.ts`).
- **Trendvikt**: `preferences.trendHero` (på som standard, Inställningar → Visning) visar trendvikten som
  huvudsiffra och dagsvikt + datum som en liten rad (`current-weight`); förklaringen bakom en info-knapp (`trend-info`,
  "Vad är trendvikt?"). Under stapeln en rad "−X kg · Y kg kvar · mål ca [månad år]" (`goalEta`: trendens prognos, annars
  datumet enligt vald takt märkt "enligt plan"). BMI och prognosens detaljer finns i Framsteg → Historik
  (`WeightDetails`). Alla härledda värden (förändring mot startvikten, kvar till mål, %, BMI, prognosens
  utgångsvikt) räknas på samma vikt som huvudsiffran – trendvikten när inställningen är på, annars dagsvikten
  (`overviewStats` i `src/lib/overview.ts`; `forecastGoal({ fromKg })` tar takten från linjen). Viktgrafen: trendlinjen
  tjock, dagsvärden som svaga punkter (`--chart-point-faint`).
- **Veckosummering** (`weekSummary.ts`, veckor mån–sön): `WeekSummaryCard` på Översikt visar förra veckans rubrik
  (en rad → Framsteg → Veckor) från veckans första öppning tills den stängs (`preferences.weekCardDismissed` = måndagen); alla avslutade
  veckor med data under Framsteg → Veckor (`pastWeeks`; en `ListRow` per vecka med snittvikt (`averageKg`), tryck = summeringen och "Fråga AI" i en panel). Trend = EMA vid veckans slut − dagen före veckan
  (kräver vägning i veckan); snitt räknas över loggade dagar. Rader har `feature` och filtreras. Texter är
  sakliga och uppmuntrande, aldrig skuldbeläggande; uppgång (bort från målet) beskrivs neutralt.
- **Platå** (`plateau.ts`, `PlateauCard` på Översikt efter veckokortet): utvärderas bara när takten > 0 (aldrig i
  viktstabiliseringsläget), ≥ 28 dagar efter `profile.startDate` och med vägning ≥ 70 % av de senaste 21 dagarna. Platå =
  EMA-trendvikten idag − dagen före fönstret är < 0,2 kg (absolut). Stäng sparar dagen i `preferences.plateauDismissed`;
  kortet visas igen tidigast 14 dagar senare. Analysen jämför de senaste 21 hela dagarna (t.o.m. igår) mot de 21 innan:
  snittintag per loggad dag, loggade matdagar, snittsteg, pass/vecka, GLP-1-dos och förbrukning (`buildPlan` dagen efter
  perioden, adaptiv eller formel). Förklaringar (`Explanation`, med `feature`) rangordnas efter ungefärlig kcal/dag; de två
  första visas, alltid med notisen om vätska och mätbrus. "Fråga AI om platån" = `AskAi` med ämnet `plateau`
  (`AI_PLATEAU_TEMPLATE`; kryssrutan "Platåanalysen", inga matpreferenser).
- **Rapport** (`report.ts`, Framsteg → Rapport, `#/framsteg/rapport` = val, `#/framsteg/rapport/visa` = rapporten): period
  4 v / 12 v (t.o.m. idag) / sedan start (startdatum eller första vägningen) / egen (kortas till idag). Sektioner (med
  `feature`): grunddata, viktgraf, midja, GLP-1 (dostidslinje, missade doser när ±3-dagarsfönstret passerat, aptit,
  biverkningar), kost (snitt per loggad dag, fiber via Livsmedelsverkets data och `partsOf`, snabbloggar utan fiber),
  tillskott (dagar med tagen dos), träning (pass per kalendervecka), steg, bilder (första och senaste tillfället, av som
  standard). `ReportDocument` är alltid ljust (`theme-light`), grafer är `SvgChart` (SVG), utskrift A4 med en sektion per
  sida. "Spara som PDF" = `window.print()` (titeln sätts till perioden = filnamnet); instruktionen visas första gången.
  Inga nätverksanrop (livsmedel.json är precachad).
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
- **Näringsvärden och komplettering** (`foodNutrition.ts`, `NutritionStatus`, `NutritionCompleteForm`, `LogUpdateOffer`): logg-sheeten
  (`FoodLogForm`, efter skanning och vid sök) visar för livsmedel från OFF, Livsmedelsverket, Fineli och egna kcal, protein,
  kolhydrater, fett, fiber och socker per 100 g/ml med ursprung per värde (källan eller "Eget värde"); saknas något: "saknas",
  etiketten "Ofullständig näringsdata" (`tag-incomplete`) och "Komplettera" (annars "Rätta näringsvärden" i den hopfällda listan).
  Formuläret förifylls (märkt "Från Open Food Facts"/"Eget värde"/"Saknas"), alla värden kan rättas, och "Fota etiketten med AI"
  (`AiLabelImport` livsmedel: per 100 g/ml + `fiberG`, `sockerG`, `portionG`) fyller fälten efter förhandsvisning. Sparas som
  `FoodOverride` (bara värden som skiljer sig från källan; tömt eget värde = källans igen); ett eget livsmedel ändras direkt
  (`completeStoredFood`). En portion från AI blir egen enhet "portion". Egna värden läggs på i `useFoodData` (livsmedel) och
  `storedItems` (egna/OFF) och i fiberuppslagen (`overlayExtras`: `useFiber`, rapporten, UL-varningen) – nästa skanning (lokalt
  först) visar dem. Efter sparning: `LogUpdateOffer` ("Bara idag", "Senaste 7 dagarna" = idag + 6, "Alla") skriver nya kcal/makron
  i tidigare poster (`putFoodLogEntries`); fiber och socker slås alltid upp på livsmedlet. Inte vid redigering av en post.
- **Näringsetiketter** (`data/nutritionClaims.ts`, `claims.ts`, `ClaimTags`): EU 1924/2006 – Proteinrik = ≥ 20 % av energin från
  protein (4 kcal/g), Fiberrik = ≥ 6 g/100 g eller ≥ 3 g/100 kcal, Energisnål = ≤ 40 kcal/100 g (≤ 20 kcal/100 ml för drycker:
  `per100Unit` ml eller kategori `dryck`/`mjolk`). Saknat underlag (t.ex. ingen fiber, OFF utan protein) = ingen etikett;
  snabbloggar har inga. Måltider och recept: andelarna per portion, fiber ur ingredienserna (`fiberForItem`, summa i underkant).
  Visas (`tag tag-claim tag-protein|fiber|food`) i sökträffar, Senaste, Favoriter, Måltider, logg-sheeten och Mat → Egna.
  Filterchips i sök-sheeten (`claim-filter-*`, alla valda måste gälla; sökningen tar 400 träffar och visar 20). Inställningar →
  Visning → Näringsetiketter döljer etiketter och chips (`preferences.claimsHidden`).
- **Tillskott** (`supplements.ts`, bakom brytaren `tillskott`, av som standard): Logga → Tillskott (`SupplementsLog`):
  dagens chips, "Lägg till" (skanna, AI från etikett, manuellt) och "Mina tillskott" (tryck = formulär, svep = ta bort
  med Ångra). `SupplementForm`: namn, enhet (tablett, kapsel, droppe, ml, brustablett), mängd per dos, näringsämnen ur
  `SUPPLEMENT_NUTRIENTS` (vitaminer och mineraler i `NUTRIENTS`) med egen enhet; D-vitamin i µg eller IE med omräkning.
  Förifylls från Open Food Facts (`parseOffSupplement`: `<ämne>_serving` i gram → ämnets enhet) när värdena finns.
  AI-import (`aiLabel.ts`, `AiLabelImport`): prompten ber om ENDAST JSON `{ namn, enhet, mangdPerDos, naringsamnen:
[{ amne, mangd, enhet }] }`; svaret valideras (kodblock tolereras, okända ämnen hoppas över med varning, fel enhet och
  saknade fält ger fel), förhandsvisas och förs in i formuläret för rättning. Mat har samma import per 100 g
  (`parseFoodLabel` → `CustomFoodForm prefill`). Översikt → Att göra idag: en rad per otaget tillskott (tryck = tagen, Ångra) och "Alla tagna".
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
  hopfällbart kort per måltid (rutnät: pil, namn + antal poster (kortas med …), kcal i fast kolumn, ⋯, + som öppnar
  sheeten förvald till måltiden; makroraden under, indragen i linje med namnet); pågående
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
- **Föreslå** (`suggestions.ts`, `SuggestSheet`, `data/suggestions.ts`, helt lokalt): ingångar = ikonknappen Föreslå (glödlampa,
  `SuggestIcon`) bredvid skannern i Mat → Dag (pågående måltid efter klockslaget) och "Föreslå" överst i måltidens ⋯-meny (⋯ visas då även för tomma
  måltider); bara för idag. Måltiden byts i panelen (`SegmentedControl`). Kandidater: livsmedel loggade de senaste 28 dagarna
  (före idag, inte snabbloggar), favoriter, egna måltider och recept – inte det som redan loggats i måltiden idag eller är dolt.
  Mängd = median av tidigare loggar där livsmedlet var en huvudkomponent (`mainComponentEntries`: måltid med ≤ 2 poster, största
  posten eller ≥ 25 % av måltidens kcal) i den vanligaste enheten (`typicalAmount`), annars standardportionen (`standardAmount`).
  Vana (`historyWeight`) = hur ofta och hur nyligen × andelen loggar i just måltiden, +0,25 för egen data. Färre än 5 egna
  kandidater i måltiden → startlistan fyller på med vikt 0,3 × (1 − n/10), märkt "Allmänt förslag"; en egen variant (samma första
  ord) går före. **Gap** (`gapsOf`): proteingap = max(0, proteinmål − intag), fibergap likadant mot veckans fibermål (annars
  referensvärdet); stort = mer än 10 % av målet kvar (`GAP_SMALL_SHARE`). **Stort gap** (`scoreMode` `gap`): näringspoäng
  (`nutritionScore`) = wP × min(protein, proteingap)/proteingap + wF × min(fiber, fibergap)/fibergap, vikterna proportionella mot
  andelen av målet som återstår (ett litet gap får vikt 0). Poäng (`gapScoreParts`) = 0,7 × näring (normerad mot bästa kandidaten)
  plus vana (högst 0,2) + lätthet (högst 0,1, energitäthet), kapade per förslag så att näringen är ≥ 70 % och vanan ≤ 20 % av
  summan; minus straff för att gå över det som är kvar (`overBudgetPenalty`) och över måltidens typiska kcal (`portionPenalty`).
  **Små gap** (`small`): 0,5 × lätthet + 0,5 × vana − straff. Proteinkällor (`isProteinSource`: ≥ 20 % energi från protein och ≥ 5
  g/100 g) skalas inom 0,5–2 × portionen mot proteingapet så långt portionstaket räcker (`scaleProteinPortion`); övriga skalas ner
  mot taket (`fitPortion`, högst till hälften). Ingen portion under kategorins minsta (`MIN_PORTION_G`: kött/fisk 75 g, ägg 1 st,
  fil/kvarg 1 dl …, `atLeastMinPortion`); styck i hela. Portionstak (`portionCap`) = måltidens typiska kcal (median per dag, 28
  dagar, minst 3 dagar; annars 25/30/30/15 % av dagsmålet), högst det som är kvar. Förslag över kvarvarande kcal visas inte.
  Kombinationer (`combinations`) kompletterar: en protein- eller fiberkälla för ett stort gap + något som loggats ihop med den i
  måltiden ≥ 2 gånger, eller proteinrik + fiberrik (båda gapen stora) där minst den ena ätits i måltiden; ett livsmedel ingår i
  högst en kombination. Etiketter (`claimsOfParts`) räknas på kombinationens totala näring, aldrig ärvda. Variation (`diversify`):
  ett livsmedel i högst ett av tre förslag som visas samtidigt. Förklaring per förslag (`reasonFor`, `suggest-reason`). Lägesraden
  (`statusText`): "41 g protein och 6 g fiber kvar · 302 kcal kvar" (gap > 10 %, störst först), "Du ligger bra till idag" bara när
  båda är inom 10 %; från kl. 20 nämns inte protein/fiber ("302 kcal kvar idag"). Lågt läge (< 150 kcal kvar eller över målet):
  bara Energisnål (även startlistans oavsett måltid), `LOW_TEXT`, ingen "kvar efteråt". Tre förslag i taget ("Visa fler"),
  högst 12. Logga = en post per del i vald måltid + toast med Ångra; Justera = `FoodLogForm` förifylld (`last`, `defaultMeal`), en del i
  taget; "Inte intresserad" = `preferences.suggestionsHidden` (`{ key, name }`, Ångra i toasten, "Visa alla förslag igen" i
  Inställningar → Visning) och nedviktar liknande (`dislikeFactor`: samma första ord ×0,4, samma kategori ×0,75). "Något nytt" =
  `AskAi` med ämnet `suggest` (`AI_SUGGEST_TEMPLATE`: måltid, typisk portion, kvar idag, 15 vanligaste livsmedlen). Tomt läge
  (`EmptyState`) med "Något nytt". Startlistans värden kontrolleras mot public/*.json i `suggestions.test.ts`.
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
- **Fineli** (`fineliImport.ts`, `scripts/fetch-fineli.ts`, `fineliCategories.ts`): THL:s finska livsmedelsdatabas, CC BY 4.0,
  med svenska namn (`foodname_SV.csv`). `npm run fineli` hämtar första paketet på fineli.fi/fineli/sv/avoin-data med alla
  filer (eller `FINELI_ZIP_URL`, eller ett nedladdat paket via `FINELI_DIR=<mapp|zip>`) och skriver `public/fineli.json`
  i samma format som Livsmedelsverkets (energi kJ → kcal, CHOAVL, FIBC, VITPYRID = B6, NACL mg → g; grupp = FUCLASS,
  `version` ur descript.txt; version 20:s versalnamn skrivs om med `fineliName`, arkiverade "(ARC)"-livsmedel hoppas över).
  Incheckad: version 20.0 (baspaket 1). Workflowet `fineli.yml` kör skriptet när det ändras eller manuellt och checkar in
  filen – fineli.fi nekar (403) anrop från GitHub Actions, så då blir det en varning (kod 2) och filen lämnas orörd;
  uppdatera i så fall lokalt med `FINELI_DIR=<zip> npm run fineli`.
  Livsmedel `fi:<FOODID>`, källa `fineli`; `loadLivsmedel()` laddar båda filerna, så Fineli ingår överallt där
  Livsmedelsverkets data används (sök, fiber, vitaminer/mineraler, analys, rapport, receptimport). Kategorin: namnet,
  sedan `FINELI_CLASSES[FUCLASS]` (Livsmedelsverkets `GROUP_RULES` gäller inte `fi:`). Appen anropar aldrig Fineli.
- **Sökning i alla källor** (`searchIndex`): egna livsmedel, måltider, recept, cachade OFF, Livsmedelsverket och Fineli
  i ett index. Sortering: poäng, hela namnet exakt, träff på första ordet, källa (`SOURCE_RANK`: egna → LV → OFF →
  Fineli, dvs. Livsmedelsverket vid likvärdig träff), kortare namn. Dubbletter mellan LV/Fineli/OFF (`dedupeKey`: ord
  utan småord i bokstavsordning; samma nyckel, eller ett tecken fel i en nyckel ≥ 8 tecken med energi inom 15 %/10 kcal)
  visas en gång, från källan som rankas först. Egna livsmedel döljs aldrig. Träffarna har en liten källetikett
  (`tag tag-source`: LV, Fineli, OFF, Egen; skärmläsare "Källa: …") före energin.
- **Livsmedel**: `livsmedel.json` har valfri sjunde kolumn (grupp, `""` = ingen) och åttonde (övriga näringsämnen i
  ordningen i filens `extra`, `null` = saknas; `pickExtraNutrients` matchar EuroFIR-kod eller namn och räknar om enheten).
  Livsmedelsverkets databas (CC BY 4.0 – källan visas, liksom Finelis, i Inställningar → Om appen, `LivsmedelSource`) hämtas med
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
- **Filformat** (`BACKUP_FORMAT = 'viktresan-backup'`, `BACKUP_VERSION = 11`):
  - Okrypterad zip: `backup.json` (format, version, exportedAt, profil, `weights`, `waist`, `steps`,
    `photoSessions`, bildmetadata med `file`, `sessionId`, `angle`, `foods`, `meals`, `foodLog`, `favorites`, `water`, `workouts`,
    `workoutPlans`, `medications`, `injections`, `symptoms`, `foodUnits`, `milestones`, `supplements`, `supplementLog`, `recipes`, `foodOverrides`) + `photos/<id>.<ext>` (bilderna oförändrade, okomprimerat i zip:en).
  - Version 1 (kombinerade `measurements`) kan fortfarande importeras; den delas upp med
    `splitLegacyMeasurements`. Version 1–2 saknar mat och ger tomma matlistor; version 1–3 saknar
    vatten och träning och ger tomma listor; version 1–4 saknar GLP-1 och ger tomma listor; version 3–5
    har portioner i stället för enheter och uppgraderas med `upgradeFoodData`; version 1–6 saknar milstolpar
    (tom lista – efter importen markeras passerade milstolpar utan firande); version 1–7 saknar fototillfällen och
    grupperas med `groupLegacyPhotos` (vinkel "ej angiven"); version 1–8 saknar tillskott (tomma listor); version 1–9 saknar recept (tom lista); version 1–10 saknar egna näringsvärden (tom lista). En bild vars `sessionId` saknas bland tillfällena avvisas.
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
- **Påminnelse** (raden "Dags att säkerhetskopiera" i Översikt → Att göra idag): visas när det finns data och ingen export gjorts
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

## PR-beskrivningar

- Avsluta varje PR-beskrivning med en **checklista som speglar varje punkt i uppdraget**, en rad per punkt, bockad
  (`- [x]`) om den är gjord.
- Punkter som **inte gjorts eller gjorts annorlunda** markeras tydligt (`- [ ]` resp. `- [x] ⚠️ Annorlunda:`) med
  orsaken på samma rad.
- Lista **var nya funktioner nås i appen**, som en navigeringsväg (t.ex. "Översikt → veckoraden under kcal-ringen").

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
