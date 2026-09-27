# UI-granskning av Viktresan

Granskat 2026-09-27 på Pixel 7 (412 × 839, Chromium) i ljust och mörkt tema, med fast testdata och fryst
datum (torsdag 2026-09-24 12:30, `e2e/visualData.ts`). Skärmdumparna finns i `e2e/__screenshots__/`
(`light-*.png` / `dark-*.png`). De togs med `npm run test:visual:update` innan designsystemet infördes;
baslinjerna i repot visar läget _efter_ den här PR:en. Översikt före finns kvar som jämförelse:
[`ui-audit/fore-light-oversikt.png`](ui-audit/fore-light-oversikt.png) och
[`ui-audit/fore-dark-oversikt.png`](ui-audit/fore-dark-oversikt.png); likaså Framsteg → Historik och Mat → Historik före
PR #21 (`ui-audit/fore-*-framsteg-historik.png`, `ui-audit/fore-*-mat-historik.png`) och Kalender före PR #22
(`ui-audit/fore-*-kalender.png`, `ui-audit/fore-*-kalender-vecka.png`), Mat → Egna och Mat → Historik före PR #23
(`ui-audit/fore-*-mat-egna.png`, `ui-audit/fore-*-mat-historik-7dagar.png`), Framsteg → Veckor och Logga före PR #24
(`ui-audit/fore-*-framsteg-veckor.png`, `ui-audit/fore-*-logga.png`), Framsteg → Bilder och Milstolpar före PR #25
(`ui-audit/fore-*-framsteg-bilder.png`, `ui-audit/fore-*-framsteg-bilder-galleri.png`, `ui-audit/fore-*-framsteg-milstolpar.png`)
Mats redigera-, analys- och sökpanel före PR #26 (`ui-audit/fore-*-sheet-mat-redigera.png`,
`ui-audit/fore-*-sheet-mat-analys.png`, `ui-audit/fore-*-sheet-mat-sok.png`) samt radioknapparna i Inställningar och
jämförelsen/helskärmsvyn i Bilder före PR #27 (`ui-audit/fore-*-sheet-installningar-aktivitet.png`,
`ui-audit/fore-*-sheet-installningar-bilder.png`, `ui-audit/fore-*-sheet-installningar-import.png`,
`ui-audit/fore-*-bilder-jamfor.png`, `ui-audit/fore-*-bilder-helskarm.png`).

**Referens:** Mat → Dag (omgjord i PR #16/#17): 16 px sidmarginal, 8 px mellan kort, 12–16 px inre
marginal, en rad per post med högerställda tabellsiffror, sekundärtext 13 px, inga knappar i listorna
(tryck = redigera, svep = ta bort/favorit med Ångra), panel nerifrån för allt annat.

Prioritet: **Hög** = märks i vardagen/bryter mot en regel i DESIGN.md, **Medel** = inkonsekvens som syns
vid jämförelse, **Låg** = putsning.

## Hela appen (tvärgående)

| Prio  | Iakttagelse                                                                                                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hög   | **24 olika textstorlekar** i `index.css` (0,7–6 rem, bl.a. 0,8 / 0,85 / 0,875 / 0,9 / 0,9375 rem bredvid varandra). Ingen skala; varje vy har egna värden.                                                                                                   |
| Hög   | **Färg per datatyp saknas.** Mat är orange i ringen (`--ring-kcal`), bärnsten i kalendern (`--macro-carbs`) och teal i intagsgrafen (`--accent`). Steg är lila i kalendern (`--macro-fat`) men teal i grafen. Samma sak betyder olika färg på olika ställen. |
| Hög   | **Knappar i listor.** "Redigera"/"Ta bort" som två inramade knappar per rad (Logga → vikt, midja, steg, Egna livsmedel, Kalender). Tar plats, ger dubbelt så höga rader och gör destruktiva åtgärder lättillgängliga. Mat löser det med tryck/svep + Ångra.  |
| Hög   | **Flera primära knappar per vy.** Översikt har upp till ~12 fyllda knappar samtidigt (Logga dos, Klar × n, fyra dryckesknappar). Inget säger vad som är _den_ viktigaste handlingen.                                                                         |
| Medel | Hörnradier: 4, 8, 10, 12, 14, 16, 20 px och 999 px används om vartannat (kort 16 px, måltidskort 14 px, knappar 12 px, segment 10/14 px).                                                                                                                    |
| Medel | Inre marginal i kort: 20 px överallt utom Mat (12–16 px). Övriga vyer känns luftiga och längre än nödvändigt.                                                                                                                                                |
| Medel | Skuggor är ad hoc (`0 1px 3px`, `0 6px 24px`, `0 12px 40px`, olika alfa).                                                                                                                                                                                    |
| Medel | Tomma lägen (`EmptyState`) är bara text i en streckad ruta, utan en tydlig nästa handling (knapp).                                                                                                                                                           |
| Medel | Ingen laddningsindikator: vyer är tomma tills IndexedDB svarat och hoppar sedan in (layoutskift).                                                                                                                                                            |
| Medel | Sidrubriken scrollar bort; i långa vyer (Översikt, Historik, Inställningar) ser man inte var man är.                                                                                                                                                         |
| Medel | Paneler (bottom sheets) glider upp men stängs utan övergång; kvitton (toast) finns i tre varianter (uppdatering, genväg, mat) med olika knappordning.                                                                                                        |
| Medel | Ingen haptisk återkoppling vid spara/klar.                                                                                                                                                                                                                   |
| Låg   | Siffror och enheter bryts över rader ("1 054 kcal (mål 1 685 kcal) · 7 ↵ dagar" i veckokortet, "30 ↵ min" i passlistan).                                                                                                                                     |
| Låg   | ~~Grafaxlar visar amerikanskt datumformat ("9/13", "7/29 2026") i en i övrigt svensk app.~~ ✅ PR #21: "13 sep." i alla grafer.                                                                                                                              |
| Låg   | Fasta element: vid helsidesskärmdumpar hamnar bottennavigeringen mitt i sidan – inget fel i appen, men testerna behöver hantera det (görs i `visual.spec.ts`).                                                                                               |

## Översikt

| Prio  | Iakttagelse                                                                                                                                                                                                                                                                   |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hög   | **Sidan är 3 600 px hög** med testdatan. "Blev passet av?" listar _alla_ obesvarade pass (upp till 28 dagar bakåt), var och en med två stora knappar – med nio obesvarade pass (ett schema som inte besvarats på tre veckor) blev sidan 4 600 px och kortet ensamt ~1 600 px. |
| Hög   | **Fem kort med samma tyngd efter varandra**: huvudsiffra, statistik (total förändring, kvar, BMI, mål + stapel), kalorimål, snitt per vecka, prognos. Huvudsiffran och målstapeln hör ihop men ligger i olika kort; prognosen är ett eget kort för en mening.                 |
| Hög   | **Idag blandar tre visualiseringar**: en stor dryckesring (120 px), två små näringsringar (96 px) med olika textstil, och sedan en `dl` med Dryck/Steg/Träning där dryck upprepas.                                                                                            |
| Hög   | Dryckesknapparna är fyra fyllda primärknappar i ett 2×2-rutnät + "Ångra senaste" som egen knapp.                                                                                                                                                                              |
| Medel | "Snitt per vecka" är en tabell med rubrikrad för fyra rader; "Kommande" och "Nästa dos" har egna kort med olika radlayout.                                                                                                                                                    |
| Medel | Doskortet ("Dosdag idag") har egen kantfärg (orange) som inte är en semantisk färg.                                                                                                                                                                                           |
| Medel | Veckokortets rader bryter värden över två rader (se tvärgående).                                                                                                                                                                                                              |
| Låg   | Tomt läge (ingen profil): länk i löptext i stället för en knapp.                                                                                                                                                                                                              |

## Logga

| Prio  | Iakttagelse                                                                                                                                                                            | Status                 |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Medel | Rutnätet är luftigt (130 px höga rutor, 20 px marginal) men fungerar. Alla ikoner är teal – datatypens färg borde användas så att ikonen känns igen i kalendern och graferna.          | ✅ PR #24              |
| Hög   | **Panelerna (vikt, midja, steg, dryck, träning, GLP-1)** lägger formuläret i ett kort inne i panelen (kort-i-kort), och historiken under har "Redigera"/"Ta bort" som knappar per rad. | ✅ PR #19              |
| Medel | "Stäng" är en inramad knapp i panelens rubrik – i Mat-sheeten är det samma knapp; en ikonknapp (×) eller textknapp vore lättare.                                                       | ✅ (textknapp, PR #18) |
| Medel | Datumfält i paneler visar `mm/dd/yyyy` i vissa webbläsare; Mats `DateBar` (‹ Idag ›) är både kompaktare och tydligare.                                                                 | ✅ PR #19              |
| Låg   | ±0,1-knapparna under vikten är lika höga som Spara och konkurrerar visuellt.                                                                                                           | ✅ PR #19              |

## Mat (referens)

| Prio  | Iakttagelse                                                                                                                                                                                                                                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medel | ~~**Egna**: sektionerna är kort med en fylld primärknapp var ("Ny måltid", "Nytt livsmedel") och "Redigera"/"Ta bort"-knappar per livsmedel – följer inte Dag-flikens mönster.~~ ✅ PR #23                                                                                                                       |
| Medel | **Historik**: tidsfilter (1 mån/3 mån/Allt) är ett stort segment (48 px) direkt under sidans lilla segment – två segmentkontroller i olika storlek ovanpå varandra. Intagsgrafen är teal i stället för Mats orange. ✅ PR #18 (orange), PR #21 (tidsfiltret är chips), PR #23 (snitt som `StatBar`, tät tabell). |
| Medel | ~~Redigera-panelen: kort-i-kort, och "Ta bort" är en helbreddsknapp under Spara/Avbryt (tre knappar). Ta bort bör ligga längst ner som textknapp i fel-färg, eller bara via svep.~~ ✅ PR #26                                                                                                                    |
| Låg   | ~~Analyspanelen: nyckeltalen är staplade etikett/värde-par, de skulle vara ListRow med högerställt värde.~~ ✅ PR #26                                                                                                                                                                                            |
| Låg   | ~~Sök-sheeten saknar ikon i sökfältet (Dag-fliken har en).~~ ✅ PR #26                                                                                                                                                                                                                                           |

## Kalender

| Prio  | Iakttagelse                                                                                                                                             | Status    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Hög   | Förklaringen (legend) har 14 poster i tre grupper och tar lika mycket plats som månaden. Prickarnas färger följer inte resten av appen (se tvärgående). | ✅ PR #22 |
| Medel | Dagsvyn: etikett och värde på varsin rad ("Vikt ↵ 86,8 kg") → dubbelt så lång lista som behövs. Status-väljaren + "Ta bort" per pass.                   | ✅ PR #22 |
| Medel | ‹ › för månad är inramade 48 px-knappar; Mats datumrad använder ramlösa pilar.                                                                          | ✅ PR #22 |
| Låg   | Segmentet Månad/Vecka är stort (48 px) jämfört med Mats lilla segment.                                                                                  | ✅ PR #22 |
| Låg   | Veckovyn bryter värden mitt i siffror ("6 000 ↵ steg", "1 ↵ 092 kcal").                                                                                 | ✅ PR #22 |

## Framsteg

| Prio  | Iakttagelse                                                                                                                                                                                                                           | Status    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Hög   | **Historik är 3 800 px** (5 100 px med två månaders mer data): "Vikt dag för dag" listar alla mätningar i en tabell, dryckeshistoriken har en stapel per dag. Behöver begränsas (senaste 14 + "Visa fler") eller grupperas per vecka. | ✅ PR #21 |
| Medel | Två segmentkontroller ovanpå varandra (flikar + tidsfilter), båda 48 px.                                                                                                                                                              | ✅ PR #21 |
| Medel | Veckor: varje vecka är ett stort kort med "Fråga AI om veckan" som knapp i varje kort; värden radbryts.                                                                                                                               | ✅ PR #24 |
| Medel | Bilder: tomt läge och lagringskortet saknar mellanrum (korten klistras ihop).                                                                                                                                                         | ✅ PR #25 |
| Låg   | Milstolpar: bra täthet; ikonerna i streckade cirklar är den enda platsen med streckade ramar utöver tomma lägen.                                                                                                                      | ✅ PR #25 |
| Medel | Bilder: jämförelsen (`SessionCompare`) har egna knappar i kortets rubrik ("Första mot senaste", "Avsluta jämförelse") och helskärmsvyn (`PhotoViewer`) tar bort med bekräftelse i två steg i stället för Ångra.                       | ✅ PR #27 |

## Inställningar

| Prio  | Iakttagelse                                                                                                                                                                                                                                                                                                 | Status                                  |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Hög   | **En enda lång sida (≈ 5 000 px)** med 12 kort, var och en med egen primärknapp (Spara profil, Spara matpreferenser, Spara dryckesmål, Exportera, Välj säkerhetskopia, Begär beständig lagring, Sök efter uppdatering). Bör grupperas som en lista (ListRow med chevron) där varje grupp öppnas i en panel. | ✅ PR #20                               |
| Medel | Kryssrutor och radioknappar är webbläsarens standard (olika storlek i ljust/mörkt), medan resten av appen har egna kontroller.                                                                                                                                                                              | ✅ (switchar, PR #20; valrader, PR #27) |
| Låg   | Förklarande text i 13 px över nästan varje fält gör sidan tung att skumma.                                                                                                                                                                                                                                  | ✅ (bara i panelerna)                   |

## Paneler (bottom sheets)

| Prio  | Iakttagelse                                                                                                                                                                | Status    |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Hög   | Kort-i-kort i nästan alla paneler (Logga, Redigera post, Markera som klar). Panelens bakgrund är `--bg` och korten `--surface` – ger dubbla ramar och 36 px inre marginal. | ✅ PR #18 |
| Medel | Panelens rubrik: 20 px rubrik + inramad "Stäng" (48 px) tar ~80 px innan innehållet börjar.                                                                                | ✅ PR #18 |
| Medel | Ingen stängningsövergång; ingen handtagsindikator (grabber).                                                                                                               | ✅ PR #18 |
| Låg   | Helskärmspaneler (sök, analys, Fråga AI) har samma rubrikrad som halva paneler – ok, men saknar skugga när innehållet scrollar under.                                      | ✅ PR #28 |

## Åtgärdat i den här PR:en

- Tokens för avstånd, typografi (5 storlekar i hela `index.css`), radier, skuggor, semantiska färger och en
  färg per datatyp – tillämpade i grafer (vikt, steg, intag), kalenderprickar, Logga-ikoner, ringar och staplar.
- Delade komponenter (`docs/DESIGN.md`); Mat → Dag bygger nu på `SectionAccordion`, `ListRow`, `StatBar`,
  `SegmentedControl`, `Toast` och `Skeleton` (utseendet oförändrat).
- Översikt: huvudsiffra, målstapel, nyckeltal och prognos i ett kort; Idag med tre lika ringar och chips för
  dryck; "Blev passet av?" visar högst tre pass (+ "Visa alla"); sekundära knappar; snitt per vecka som
  `ListRow` (fyra veckor); `EmptyState` med knapp; `Skeleton` under laddning. Sidan är ~17 % kortare med samma data och har inga fyllda knappar kvar utom i tomt läge.
- Alla paneler: kort-i-kort borttaget, grabber, textknapp "Stäng", övergångar vid öppna/stäng.
- Sticky sidhuvud som krymper, haptik vid spara/klar (kan stängas av), siffror bryts inte i veckokortet.

## Åtgärdat: paneler i Logga (PR #19)

- **Historik som `ListRow`** i alla paneler: viktmätningar, midjemått, dryck idag (inkl. dryck från Mat),
  scheman, doser, läkemedel och mående. Inga Redigera/Ta bort/Bekräfta-knappar kvar. Tryck = redigera i
  formuläret ovanför (vikt, midja, mående) eller radmeny (`ActionSheet`: dos, schema, läkemedel med
  "Ändra"); svep vänster = ta bort. Borttagning sker direkt och följs av en `Toast` med Ångra i panelen
  (`useUndoToast`) – bekräftelse i två steg är borta. Formulär som redigerar en post har "Ta bort …" som
  destruktiv textknapp längst ner (samma borttagning utan svep).
- **`DateBar`** (‹ Idag ›) i stället för datumfältet i vikt, midja, steg, dos och mående – en rad kortare
  och inget `mm/dd/yyyy`. Planering framåt (pass, scheman) har kvar vanliga datumfält.
- **Vikt**: −0,1 [ 86,8 ] +0,1 på en rad med små sekundära knappar; rubriken "Dagens vikt" borttagen
  (panelrubriken + "Idag" räcker), "Redigera vikt" visas vid redigering. Panelens formulär är ~150 px
  lägre – listan börjar på första skärmen.
- **Dryck**: snabbvalen är chips (som på Översikt) i stället för tre fyllda knappar – Spara/Lägg till är
  inte längre i konkurrens med tre primärknappar; "Ångra senaste" är en textknapp.
- **Träning/GLP-1**: flikarna använder `SegmentedControl`; tomt läge för dos är `EmptyState` med knapp.
- Designsystemet: `ActionSheet`, `useUndoToast`, `ListRow` `danger` och `.list-row-details`, `DateBar`
  med `label`/`testId`, `.nudge-field`, `.button-danger-text`, `.sheet .toast`; `BottomSheet` kan staplas
  (unikt rubrik-id, `close` från en övre panel stänger inte den under).

## Åtgärdat: Inställningar (PR #20)

- **Lista → panel**: sidan är tre grupper (Profil och mål, Appen, Data) med en `ListRow` per inställning –
  rubrik, kort förklaring, status till höger ("Mål 80,0 kg", "128 g", "7 av 7", "Av", "Senast för 2 dagar
  sedan") och ›. Varje rad öppnar sin grupp i en `BottomSheet`. Sidan är ~1 000 px i stället för ~5 000 px
  och har inga knappar alls; varje panel har högst en primärknapp.
- **Delsökvägar** öppnar en panel direkt: `#/installningar/profil`, `…/sakerhetskopia`, `…/funktioner` osv.
  "Fyll i profilen" (Översikt, Milstolpar, kalorimålet), "Sätt ett nytt mål" (mål nått) och påminnelsen om
  säkerhetskopia länkar dit.
- **Kontroller**: "Kryptera med lösenord" och "Lås appen med fingeravtryck" är switchar som i Funktioner och
  Visning (i stället för kryssrutor med text efter).
- **Om appen och Lagring**: version, commit, byggtid och använt utrymme som `ListRow` med värdet till höger
  (i stället för `dl` med etikett och värde på varsin rad). Lagring är en egen komponent (`StorageSettings`).
- **Om appen → Sök efter uppdatering**: finns en ny version blir knappen "Uppdatera nu" i panelen – kvittensen
  längst ner ligger under den modala panelen och gick inte att nå.
- Designsystemet: mönstret "Inställningslista" och `list-flush` (lista direkt i en panel) i `DESIGN.md`.

## Åtgärdat: Framsteg → Historik (PR #21)

- **Begränsade listor**: "Vikt dag för dag" och midjemåtten visar de 14 senaste, sedan "Visa 28 dagar till"/"… mått till" (textknapp,
  `ShowMore` + `useShowMore`). Byts tidsfilter börjar listan om från 14. Med testdatan är sidan **2 814 px i stället för
  3 732 px** (−25 %); med ett års vägningar är skillnaden mycket större, eftersom listan inte längre växer med perioden.
- **Dryck som stapelgraf** (`DailyBarChart`, `--data-drink`) med dagsmålet som streckad linje – samma form som steg och
  intag – i stället för en rad med stapel per dag. Sammanfattningen ("Snitt … · målet nått 6 av 11 dagar") ligger kvar
  och bryts bara vid "·".
- **En segmentkontroll**: flikarna (Historik/Veckor/Bilder/Milstolpar) är `SegmentedControl`; tidsfiltret (`RangeFilter`)
  är en rad chips i 44 px med `--text-sm`, så att det inte ser ut som en andra nivå flikar. Samma filter i Mat → Historik.
- **Grafer i datatypsfärg och på svenska**: vikt (teal), steg (lila), dryck (blå). Tidsaxeln visar "13 sep." i stället
  för "9/13" i alla grafer (`dateAxisValues` i `chartUtils.ts`) – även Mat → Historik.
- **Kort enligt systemet**: alla sektioner är `Card` med rubrik (viktgrafen har fått rubriken "Vikt"); dosbytena är
  `ListRow` (dos till vänster, "Start"/"Dosbyte" under, datum till höger) i stället för en egen lista.
- **Tomt läge** med knappen "Logga vikt" (`#/logga/vikt`) och `Skeleton` medan datan läses.
- Designsystemet: `DailyBarChart` (steg använder den också), `ShowMore`/`useShowMore`, mönstret "Tidsfilter" (chips) och
  svenska datum på tidsaxeln i `DESIGN.md`.

## Åtgärdat: Kalender (PR #22)

- **Månad/Vecka i sidhuvudet** (`SegmentedControl size="small"`, som Mat) i stället för ett 48 px-segment över
  kortet – en rad mindre.
- **‹ › utan ram** (`PeriodBar`, samma pilar som `DateBar`); månaden skrivs "September 2026".
- **Förklaringen är hopfälld** (`Disclosure` "Förklaring"): 14 poster i tre grupper tog ~110 px under varje månad.
  Dagsvyn visar nu samma prick framför varje rad, så förklaringen behövs sällan.
- **Dagsvyn som lista**: en `ListRow` per loggtyp med prick i datatypens färg och värdet till höger (i stället för
  `dl` med etikett och värde på varsin rad), rubrik med veckodag ("Torsdag 24 sep. 2026"). Långa värden (mående,
  dos) bryts bara vid "·" (`wrapValue` + `Parts`).
- **Pass utan knappar**: passet är en rad (statusprick, typ · längd · intensitet, tid, statusmärke). Tryck = radmeny
  (`ActionSheet`: Klar, Hoppade över, Markera som planerad, Ta bort passet); svep vänster = ta bort med `Toast` och
  Ångra. Statusväljaren, "Klar"-knappen och "Ta bort" med bekräftelse i två steg är borta.
- **Veckovyn**: sammanfattningen bryts bara mellan delar (`Parts`), aldrig i "6 000 steg".
- Med testdatan är månadsvyn **1 121 px i stället för 1 493 px** (−25 %); veckovyn 1 566 px mot 1 813 px trots att
  förklaringen är utfälld i skärmdumpen.
- Designsystemet: `PeriodBar`, `Disclosure`, `Parts` (även i veckokortet), `ListRow` `wrapValue` och kalenderprick som
  `leading`, mönstret "Kalender (dagsvy)" i `DESIGN.md`. `WorkoutList` har inte längre läget `manage`.

## Åtgärdat: Mat → Egna och Historik (PR #23)

- **Egna som listor**: måltider och egna livsmedel är `ListRow` (namn, ingredienser resp. "Per 100 g · 7 g protein",
  kcal till höger) i `Card`. Knapparna Redigera/Ta bort och bekräftelsen i två steg är borta: tryck = formuläret,
  svep vänster = ta bort direkt med `Toast` och Ångra (favorit och egna enheter kommer tillbaka). Formulären har "Ta
  bort livsmedlet"/"Ta bort måltiden" som destruktiv textknapp längst ner (nås utan svep).
- **Inga fyllda knappar i listvyn**: "Ny måltid"/"Nytt livsmedel" är sekundära. "Sparade …" är en `Toast` i stället
  för en statusrad ovanför korten. Med testdatan (en måltid, två livsmedel) slutar innehållet på **440 px i stället
  för 603 px** (−27 %); varje livsmedel tar 60 px i stället för 100 px.
- **Historik**: grafen har rubriken "Intag per dag" (`Card`, som i Framsteg). Snittet de senaste 7 dagarna är två
  `StatBar` (kcal och protein mot målen, som i Mat → Dag) i stället för två meningar i löptext; tomt läge har knappen
  "Logga mat". Tabellen är tät (`--text-sm`, 8 px cellmarginal) – samma `.table` gör även vikt dag för dag och
  midjemåtten i Framsteg → Historik kompaktare (2 712 px i stället för 2 814 px).
- Designsystemet: mönstren "Egna listor" och "Nyckeltal och tät tabell" i `DESIGN.md`; `CustomFoodForm` och
  `MealBuilder` har `onDelete`.

## Åtgärdat: Framsteg → Veckor och Logga (PR #24)

- **Veckor som lista**: ett `Card` ("Avslutade veckor") med en `ListRow` per vecka – "Vecka 38", datum och "loggat
  7 av 7 dagar" under, trendviktens förändring till höger och ›. Tidigare var varje vecka ett eget kort med rubrik,
  mening, sex värderader och en egen "Fråga AI om veckan"-knapp. Med testdatan (8 veckor) är fliken **877 px i stället
  för 2 387 px** (−63 %; innehållet slutar på ~720 px) och varje vecka tar 60 px i stället för 210–390 px.
- **Tryck = hela summeringen i en panel** (`BottomSheet`, rubrik "Vecka 38 · 14 sep.–20 sep."): samma innehåll som
  förut (mening, värden med pilar mot veckan innan, loggade dagar) och **en** "Fråga AI om veckan" längst ner, som
  öppnar Fråga AI ovanpå panelen. Ingen knapp per vecka i listan.
- Vecka utan vägning: "· ingen vägning" i raden och inget värde till höger. Tomt läge har rubrik och knappen "Logga
  vikt"; `Skeleton` medan datan läses.
- **Logga**: rutorna är lägre – ikon och namn på samma rad, status under (78 px i stället för 128 px, 12/16 px inre
  marginal). De sex rutorna tar 262 px i stället för 408 px; panelerna ovanpå ändras inte.
- Designsystemet: mönstren "Lista → panel (Veckor)" och "Logga-rutnät" i `DESIGN.md`; `weekName`/`weekRange` i
  `weekSummary.ts`. De två `.week-list`-reglerna (Kalender och gamla Veckor) är sammanslagna – bara Kalenderns veckovy
  använder klassen, och den ser likadan ut.

## Åtgärdat: Framsteg → Bilder och Milstolpar (PR #25)

- **Bilder, tomt läge**: ett `EmptyState` ("Inga bilder än", förklaringen och knappen "Nytt fototillfälle") i stället för
  tre block (introkort med fylld knapp, streckad ruta, lagringskort med "0 st · 0 B"). Lagringskortet visas först när det
  finns bilder. Innehållet slutar på ~400 px i stället för ~730 px.
- **Tillfällen som lista**: ett `Card` "Fototillfällen" med "Nytt fototillfälle" som sekundär knapp i rubrikraden,
  vinkelvalet som `SegmentedControl` och en `ListRow` per tillfälle (datum, anteckning, vikt till höger, ›) med bilderna
  i ett rutnät under. Knappen "Ändra" per tillfälle är borta – tryck på raden öppnar tillfället. Bilderna har samma storlek
  (tre kolumner) i tillfällena som per vinkel. "Jämför" är raden "Jämför tillfällen" överst i listan (stängs i
  jämförelsen). Med testdatan (två tillfällen, tre bilder) är vyn **1 208 px i stället för 1 570 px** (−23 %) och ett
  tillfälle tar ~210 px i stället för ~330 px.
- **Lagring** (och "Ange vinkel", med `tone="warning"`) är `Card`; värdena är `ListRow` med värdet till höger i stället för
  `dl` med etikett och värde på varsin rad. `Skeleton` medan bilderna läses.
- **Milstolpar som listor**: en `ListRow` per milstolpe med märket som `leading` (40 px; nådd = fylld, kommande = tonad
  i stället för streckad cirkel). Kommande: rubrik, tunn stapel under och "0,1 kg kvar" till höger; uppnådda: rubrik och
  datum till höger på en rad. En rad är 57 px i stället för 64–80 px; vyn 938 px i stället för 1 028 px.
- **Tomma lägen med knapp**: inga uppnådda → "Inga milstolpar än" + "Logga vikt"; utan profil → "Fyll i profilen" (tidigare
  en länk i löptext). `Skeleton` i stället för en tom sida under laddning.
- **Rättat**: Milstolpar kunde läsas innan startens tysta synk sparat passerade milstolpar, och "Uppnådda" var då tom tills
  man bytte flik (så såg baslinjen ut). `onMilestonesSaved` i `milestoneSync.ts` låter vyn läsa om. Före-bilderna är tagna
  med rättelsen, så att listorna går att jämföra.
- Nytt visuellt test `framsteg-bilder-galleri` (två tillfällen, bilder ritade med canvas i testet).
- Designsystemet: mönstren "Galleri (Framsteg → Bilder)" och "Milstolpar" i `DESIGN.md`.

## Åtgärdat: Mats redigera-, analys- och sökpanel (PR #26)

- **Redigera post**: "Ta bort" är inte längre en helbreddsknapp med ram under Spara ändringar/Avbryt, utan textknappen
  "Ta bort posten" i fel-färg längst ner i panelen (`button-ghost button-small button-danger-text`, som "Ta bort
  mätningen" i Logga). Spara ändringar är den enda fyllda knappen; borttagningen ger samma `Toast` med Ångra som svepet.
- **Analys**: sektionerna Nyckeltal, Bytesförslag och Näringsinnehåll är `Card` (i panelen utan ram, med linje emellan)
  i stället för egna `h3` och `.analysis-title`. Nyckeltalen är en `ListRow` per tal med värdet högerställt i
  tabellsiffror; fiberns rekommendation ("Rekommendation ca 12 g") är sekundärtext under etiketten i stället för att
  stå i värdet. Värdena står i en högerkolumn, som i tabellen under, i stället
  för på en egen rad under etiketten. `dl.kv` används inte längre i analysen.
- **Sök-sheeten**: förstoringsglaset (`search-icon`) står i sökfältet, som i "Sök och logga mat" på Dag-fliken.
  `.search-field` placerar ikonen och ger fältet vänstermarginal – ingen ny komponent.
- **Rader i helskärmspaneler** (sök, analys, Fråga AI, veckosummeringen) har panelens bakgrund (`--bg`) i stället för
  `--surface`, så att en `ListRow` inte blir ett ljust band (`.sheet-full .list-row-content`).
- Inga nya visuella tester behövdes: `sheet-mat-redigera`, `sheet-mat-analys` och `sheet-mat-sok` fanns redan.
- Designsystemet: "Formulär i en panel" och "Sökfält" i `DESIGN.md`.
- **Kvar** (se nedan): radioknapparna i Inställningar (11) och jämförelsen/helskärmsvyn i Bilder (12).

## Åtgärdat: radioknappar och Bildernas jämförelse/helskärm (PR #27)

- **Valrader i stället för radioknappar** (`ChoiceList`): aktivitetsnivån (Profil), profilsidan (Bilder) och
  importläget (Säkerhetskopia) är rader med etikett och förklaring till vänster och en egen markering till höger – samma
  form som switcharna. Markeringen är 24 px i båda teman (tidigare webbläsarens radioknapp, 22 px med `accent-color`,
  inne i en inramad ruta per alternativ). Aktivitetsnivåns fyra val tar ~240 px i stället för ~265 px och har inga
  ramar; "Ersätt all befintlig data" markeras i fel-färg när det är valt. Tangentbord och skärmläsare som förut
  (riktiga `<input type="radio">` i ett `<fieldset>`).
- **Förhandsvisningen av en säkerhetskopia** ligger direkt i panelen (ingen ruta med egen bakgrund och ram – kort-i-kort)
  och värdena är `ListRow` med värdet till höger i stället för `dl` med etikett och värde på varsin rad – lika höga
  rader, men siffrorna står i en högerkolumn och går att jämföra i en blick.
- **Jämförelsen i en helskärmspanel** ("Jämför tillfällen", `BottomSheet full`) i stället för ett kort ovanför galleriet
  med "Första mot senaste" som knapp i kortrubriken och "Avsluta jämförelse" längst ner. "Stäng" avslutar; "Första mot
  senaste" är en liten textknapp som bara visas när man valt annat. Vinkel och vy är `SegmentedControl` ("Båda" i
  stället för "Båda vinklarna", som bröts över två rader). Före/efter-raderna och meningen under är **en** `ListRow`:
  "28 dagar mellan tillfällena", datumen under och viktskillnaden till höger – vem som är före/efter står redan under
  bilderna. Bilderna börjar ~200 px högre upp (y ≈ 380 i stället för ≈ 580 px).
- **Helskärmsvyn** tar bort direkt: "Ta bort bilden" är en destruktiv textknapp längst ner (tidigare en inramad knapp som
  bytte text till "Bekräfta borttagning") och följs av en `Toast` med Ångra i vyn – bilden och ett tillfälle som
  tömdes kommer tillbaka. "Stäng" är en textknapp i rubrikraden bredvid bildtexten i stället för en fylld knapp nere till
  höger; kvar i verktygsraden är bara Äldre/Nyare.
- Nya visuella tester: `sheet-installningar-aktivitet`, `sheet-installningar-bilder`, `sheet-installningar-import`,
  `bilder-jamfor` och `bilder-helskarm` (före-bilder i `docs/ui-audit/`).
- Designsystemet: `ChoiceList` (valrader) och `SegmentedControl` med `value={null}`; jämförelsen och helskärmsvyn under
  "Galleri" i `DESIGN.md`.
- **Kvar**: inga punkter från granskningen. Mindre saker som inte stod i tabellerna: `choice-group` (veckodagar,
  injektionsställe m.m. i Logga-panelerna) och kryssrutorna i Fråga AI (`.check`) har fortfarande egna äldre stilar, och
  helskärmspanelerna saknar skugga när innehållet scrollar under rubriken (Låg, Paneler).

## Åtgärdat: sista kontrollerna (PR #28)

- **Val i Logga-panelerna** bygger på delade komponenter i stället för egen markup i `fieldset.choice-group`:
  - Status (pass), Hur ofta (läkemedel) och Aptit (mående) är `SegmentedControl` med synlig etikett (`showLabel`). De
    såg redan ut så, men var kopierad markup; nu har de samma kod och gruppen namnges av etiketten.
  - Veckodagar (schema), Biverkningar (mående) och Injektionsställe (dos) är `ChipGroup` (ny). Veckodagarna var egna
    rutor som fylldes med `--accent` när de valdes och injektionsställena egna inramade rutor – nu är båda chips som
    dryckens snabbval och biverkningarna (vald = ram och text i `--accent`), i ett rutnät med 7 resp. 2 kolumner.
    "Förslag" står som en dämpad rad i chipet. `weekday-*`- och `site-*`-stilarna är borttagna.
- **Fråga AI**: "Ta med" är switchar (`switch-list`, som Inställningar → Funktioner) i stället för webbläsarens
  kryssrutor med text efter. Förklaringen ("Inte ifyllt – …") står under rubriken och läses upp som beskrivning –
  switchens namn är bara rubriken. `.check`/`.choices` är borttagna; appen har inga standardkryssrutor eller
  -radioknappar kvar.
- **Panelrubriken får en linje** när innehållet scrollats under den (`data-stuck`, som sidhuvudet) – i alla paneler, så
  att man ser att det finns mer ovanför. Syns i `sheet-logga-radmeny`, `sheet-logga-lakemedel`,
  `sheet-installningar-aktivitet`/`-import` och `sheet-fraga-ai-scrollad`.
- Nya visuella tester: `sheet-logga-schema`, `sheet-logga-maende`, `sheet-logga-lakemedel`, `sheet-fraga-ai` och
  `sheet-fraga-ai-scrollad` (före-bilder i `docs/ui-audit/`, även `fore-*-sheet-logga-traning`/`-glp1`).
- Designsystemet: `ChipGroup`, `SegmentedControl` `showLabel`/`ariaLabel`, switchar i en grupp och linjen under
  panelrubriken i `DESIGN.md`.
- **Kvar**: inget från granskningen. `fieldset.choice-group` finns bara kvar för dostrappan (en grupp med fält, inte
  ett val). Fråga AI har fortfarande fyra knappar (Dela fylld, tre sekundära) – de är olika mål för samma prompt och
  har inte granskats.

## Rekommenderad ordning för resten av vyerna

Efter designsystemet (PR #18: Mat och Översikt) – i prioritetsordning. Alla vyer, paneler och kontroller från
tabellerna ovan är genomgångna (1–12).

1. ~~**Paneler i Logga**~~ ✅ PR #19.
2. ~~**Inställningar**~~ ✅ PR #20.
3. ~~**Framsteg → Historik**~~ ✅ PR #21.
4. ~~**Kalender**~~ ✅ PR #22.
5. ~~**Mat → Egna och Historik**~~ ✅ PR #23.
6. ~~**Framsteg → Veckor**~~ ✅ PR #24.
7. ~~**Logga** (rutnätet)~~ ✅ PR #24.
8. ~~**Framsteg → Bilder och Milstolpar**~~ ✅ PR #25.
9. ~~**Mats redigera- och analyspanel**~~ ✅ PR #26.
10. ~~**Sökikon i Mats sök-sheet**~~ ✅ PR #26.
11. ~~**Radioknappar i Inställningar**~~ ✅ PR #27 (valrader, `ChoiceList`).
12. ~~**Jämförelsen och helskärmsvyn i Bilder**~~ ✅ PR #27.

13. ~~**Kontroller i Logga-panelerna, Fråga AI:s kryssrutor och linjen under panelrubriken**~~ ✅ PR #28.
