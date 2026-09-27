# UI-granskning av Viktresan

Granskat 2026-09-27 på Pixel 7 (412 × 839, Chromium) i ljust och mörkt tema, med fast testdata och fryst
datum (torsdag 2026-09-24 12:30, `e2e/visualData.ts`). Skärmdumparna finns i `e2e/__screenshots__/`
(`light-*.png` / `dark-*.png`). De togs med `npm run test:visual:update` innan designsystemet infördes;
baslinjerna i repot visar läget _efter_ den här PR:en. Översikt före finns kvar som jämförelse:
[`ui-audit/fore-light-oversikt.png`](ui-audit/fore-light-oversikt.png) och
[`ui-audit/fore-dark-oversikt.png`](ui-audit/fore-dark-oversikt.png).

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
| Låg   | Grafaxlar visar amerikanskt datumformat ("9/13", "7/29 2026") i en i övrigt svensk app.                                                                                                                                                                      |
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

| Prio  | Iakttagelse                                                                                                                                                                            | Status                   |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Medel | Rutnätet är luftigt (130 px höga rutor, 20 px marginal) men fungerar. Alla ikoner är teal – datatypens färg borde användas så att ikonen känns igen i kalendern och graferna.          | Ikonfärg ✅, rutnät kvar |
| Hög   | **Panelerna (vikt, midja, steg, dryck, träning, GLP-1)** lägger formuläret i ett kort inne i panelen (kort-i-kort), och historiken under har "Redigera"/"Ta bort" som knappar per rad. | ✅ PR #19                |
| Medel | "Stäng" är en inramad knapp i panelens rubrik – i Mat-sheeten är det samma knapp; en ikonknapp (×) eller textknapp vore lättare.                                                       | ✅ (textknapp, PR #18)   |
| Medel | Datumfält i paneler visar `mm/dd/yyyy` i vissa webbläsare; Mats `DateBar` (‹ Idag ›) är både kompaktare och tydligare.                                                                 | ✅ PR #19                |
| Låg   | ±0,1-knapparna under vikten är lika höga som Spara och konkurrerar visuellt.                                                                                                           | ✅ PR #19                |

## Mat (referens)

| Prio  | Iakttagelse                                                                                                                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medel | **Egna**: sektionerna är kort med en fylld primärknapp var ("Ny måltid", "Nytt livsmedel") och "Redigera"/"Ta bort"-knappar per livsmedel – följer inte Dag-flikens mönster.                                        |
| Medel | **Historik**: tidsfilter (1 mån/3 mån/Allt) är ett stort segment (48 px) direkt under sidans lilla segment – två segmentkontroller i olika storlek ovanpå varandra. Intagsgrafen är teal i stället för Mats orange. |
| Medel | Redigera-panelen: kort-i-kort, och "Ta bort" är en helbreddsknapp under Spara/Avbryt (tre knappar). Ta bort bör ligga längst ner som textknapp i fel-färg, eller bara via svep.                                     |
| Låg   | Analyspanelen: nyckeltalen är staplade etikett/värde-par, de skulle vara ListRow med högerställt värde.                                                                                                             |
| Låg   | Sök-sheeten saknar ikon i sökfältet (Dag-fliken har en).                                                                                                                                                            |

## Kalender

| Prio  | Iakttagelse                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hög   | Förklaringen (legend) har 14 poster i tre grupper och tar lika mycket plats som månaden. Prickarnas färger följer inte resten av appen (se tvärgående). |
| Medel | Dagsvyn: etikett och värde på varsin rad ("Vikt ↵ 86,8 kg") → dubbelt så lång lista som behövs. Status-väljaren + "Ta bort" per pass.                   |
| Medel | ‹ › för månad är inramade 48 px-knappar; Mats datumrad använder ramlösa pilar.                                                                          |
| Låg   | Segmentet Månad/Vecka är stort (48 px) jämfört med Mats lilla segment.                                                                                  |

## Framsteg

| Prio  | Iakttagelse                                                                                                                                                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hög   | **Historik är 3 800 px** (5 100 px med två månaders mer data): "Vikt dag för dag" listar alla mätningar i en tabell, dryckeshistoriken har en stapel per dag. Behöver begränsas (senaste 14 + "Visa fler") eller grupperas per vecka. |
| Medel | Två segmentkontroller ovanpå varandra (flikar + tidsfilter), båda 48 px.                                                                                                                                                              |
| Medel | Veckor: varje vecka är ett stort kort med "Fråga AI om veckan" som knapp i varje kort; värden radbryts.                                                                                                                               |
| Medel | Bilder: tomt läge och lagringskortet saknar mellanrum (korten klistras ihop).                                                                                                                                                         |
| Låg   | Milstolpar: bra täthet; ikonerna i streckade cirklar är den enda platsen med streckade ramar utöver tomma lägen.                                                                                                                      |

## Inställningar

| Prio  | Iakttagelse                                                                                                                                                                                                                                                                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hög   | **En enda lång sida (≈ 5 000 px)** med 12 kort, var och en med egen primärknapp (Spara profil, Spara matpreferenser, Spara dryckesmål, Exportera, Välj säkerhetskopia, Begär beständig lagring, Sök efter uppdatering). Bör grupperas som en lista (ListRow med chevron) där varje grupp öppnas i en panel. |
| Medel | Kryssrutor och radioknappar är webbläsarens standard (olika storlek i ljust/mörkt), medan resten av appen har egna kontroller.                                                                                                                                                                              |
| Låg   | Förklarande text i 13 px över nästan varje fält gör sidan tung att skumma.                                                                                                                                                                                                                                  |

## Paneler (bottom sheets)

| Prio  | Iakttagelse                                                                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hög   | Kort-i-kort i nästan alla paneler (Logga, Redigera post, Markera som klar). Panelens bakgrund är `--bg` och korten `--surface` – ger dubbla ramar och 36 px inre marginal. |
| Medel | Panelens rubrik: 20 px rubrik + inramad "Stäng" (48 px) tar ~80 px innan innehållet börjar.                                                                                |
| Medel | Ingen stängningsövergång; ingen handtagsindikator (grabber).                                                                                                               |
| Låg   | Helskärmspaneler (sök, analys, Fråga AI) har samma rubrikrad som halva paneler – ok, men saknar skugga när innehållet scrollar under.                                      |

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

## Rekommenderad ordning för resten av vyerna

Efter designsystemet (PR #18: Mat och Översikt) – i prioritetsordning. Kvarvarande vyer: 2–8.

1. ~~**Paneler i Logga**~~ ✅ PR #19.
2. **Inställningar** (nästa): gruppera i `ListRow` + panel per grupp, en primärknapp per panel.
3. **Framsteg → Historik**: begränsa listorna, en segmentkontroll, grafer i datatypsfärg.
4. **Kalender**: kompakt förklaring (hopfällbar), dagsvyn som `ListRow`, pass utan knappar i listan.
5. **Mat → Egna och Historik**: `ListRow`, svep för ta bort, liten segmentkontroll för tidsfilter.
6. **Framsteg → Veckor**: täta veckokort (ListRow), en "Fråga AI"-knapp i panelen i stället för per kort.
7. **Logga** (rutnätet): lägre rutor (ikonerna har redan datatypsfärg).
8. **Framsteg → Bilder och Milstolpar**: marginaler, tomt läge med knapp.
