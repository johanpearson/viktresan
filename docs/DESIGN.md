# Viktresans designsystem

Gemensamma tokens, komponenter och regler för hela appen. **Referens för stil och täthet är Mat → Dag.**
Bakgrunden finns i [ui-audit.md](ui-audit.md). Tokens ligger överst i `src/index.css`, komponenterna i
`src/components/`.

## Principer

1. **Tät men luftig nog.** 16 px sidmarginal, 16 px inre marginal i kort, 12 px mellan kort, 8 px mellan
   kort i en lista (måltider). Hellre en rad med värdet till höger än etikett och värde på varsin rad.
2. **En sak per färg.** Varje datatyp har en färg som används överallt: graf, kalenderprick, ikon, ring
   och stapel. Semantiska färger (success/warning/danger) betyder alltid samma sak.
3. **Listor är listor.** Tryck på en rad = öppna/redigera, svep = ta bort (med Ångra). Inga
   Redigera/Ta bort-knappar i listor.
4. **En tydlig nästa handling.** En primärknapp per vy (eller panel); allt annat är sekundärt eller text.
5. **Lugn rörelse.** Korta övergångar (150–200 ms) som förklarar var saker kommer ifrån. Ingen rörelse
   alls vid `prefers-reduced-motion`.

## Tokens

### Avstånd

| Token       | px  | Används till                                 |
| ----------- | --- | -------------------------------------------- |
| `--space-1` | 4   | Mellan rubrik och metatext, små justeringar  |
| `--space-2` | 8   | Mellan kort i en lista, mellan chips/knappar |
| `--space-3` | 12  | Mellan kort, mellan block i ett kort         |
| `--space-4` | 16  | Sidmarginal, inre marginal i kort och rader  |
| `--space-5` | 24  | Mellan grupper i en panel, tomma lägen       |
| `--space-6` | 32  | Stora avbrott (sällan)                       |

### Typografi – fem storlekar

| Token       | Storlek | Används till                                    |
| ----------- | ------- | ----------------------------------------------- |
| `--text-xs` | 13 px   | Metadata, sekundärtext, etiketter, bildtexter   |
| `--text-sm` | 15 px   | Knappar i segment, täta tabeller                |
| `--text-md` | 16 px   | Brödtext, radrubriker, kortrubriker (fet)       |
| `--text-lg` | 20 px   | Nyckeltal (827 kcal), panelrubriker, ikoner (⋯) |
| `--text-xl` | 28 px   | Sidrubrik, huvudsiffra (trendvikt)              |

- **Siffror**: alltid `font-variant-numeric: tabular-nums` (klasserna `.num`, `.kcal`, `.list-row-value`,
  `.stat-bar-value`) så att kolumner linjerar och värden inte hoppar när de ändras.
- **Inga radbrytningar i siffror och enheter**: `.num`/`.nowrap` (`white-space: nowrap`). Långa
  sammansatta värden bryts bara mellan delar ("1 054 kcal (mål 1 685 kcal) · 7 dagar" bryts efter "·").
- Undantag: kamerans nedräkning (6 rem) och milstolpens emoji (3,5 rem) är grafik, inte text.

### Radier och skuggor

| Token            | Värde | Används till                               |
| ---------------- | ----- | ------------------------------------------ |
| `--radius-sm`    | 8 px  | Skeleton-rader, små markeringar            |
| `--radius-md`    | 12 px | Knappar, fält, fokusringar, segmentknappar |
| `--radius-lg`    | 16 px | Kort, sektioner, tomma lägen               |
| `--radius-sheet` | 20 px | Panelens övre hörn                         |
| `--radius-full`  | 999px | Chips, staplar, statusmärken               |
| `--shadow-sm`    |       | Vald segmentknapp                          |
| `--shadow-md`    |       | Toast                                      |
| `--shadow-lg`    |       | Firande (modal)                            |

Kort har ingen skugga – bara en 1 px ram (`--border`). Sticky rader får en 1 px linje när de "fastnat".

### Färger

Ytor och text: `--bg`, `--surface`, `--text`, `--muted`, `--border`, `--track`, `--accent`
(interaktivt: länkar, knappar, fokus), `--accent-contrast`.

Semantiska färger – samma betydelse överallt:

| Token       | Betyder                         | Exempel                                |
| ----------- | ------------------------------- | -------------------------------------- |
| `--success` | Klart, uppnått                  | Statusmärket Genomförd                 |
| `--warning` | Behöver uppmärksamhet, inte fel | Dosdag, "Blev passet av?", påminnelser |
| `--danger`  | Destruktivt eller missat        | Svep för att ta bort, obesvarat pass   |

En färg per datatyp (ljust / mörkt tema):

| Token               | Datatyp   | Ljust     | Mörkt     | Syns i                                                |
| ------------------- | --------- | --------- | --------- | ----------------------------------------------------- |
| `--data-weight`     | Vikt      | `#0f766e` | `#2dd4bf` | Viktgraf, målstapel, kalenderprick, Logga-ikon        |
| `--data-food`       | Mat       | `#c2410c` | `#fb923c` | Kaloriring/-stapel, intagsgraf, kalenderprick         |
| `--data-drink`      | Dryck     | `#0284c7` | `#38bdf8` | Dryckesring, dryckeshistorik, kalenderprick, ikon     |
| `--data-steps`      | Steg      | `#7c3aed` | `#c4b5fd` | Stegdiagram, kalenderprick, ikon                      |
| `--data-training`   | Träning   | `#4d7c0f` | `#a3e635` | Kalenderprick, ikon                                   |
| `--data-dose`       | Dos       | `#4338ca` | `#a5b4fc` | Dosbyten i viktgrafen, kalenderromb, ikon             |
| `--data-waist`      | Midja     | `#db2777` | `#f472b6` | Kalenderprick, ikon                                   |
| `--data-mood`       | Mående    | `#a16207` | `#fde047` | Kalenderprick                                         |
| `--data-supplement` | Tillskott | `#a21caf` | `#f0abfc` | Tillskottsdelen i näringsstaplar, kalenderprick, ikon |

Tonerna `waist` och `mood` (`tone-waist`, `tone-mood`) finns för grafer i rapporten.

Protein har `--macro-protein` (samma teal som vikt, men används bara i matens detaljer) och fiber `--macro-fiber`
(`#15803d` / `#4ade80`, ton `fiber`: fiberring och -stapel, etiketten "Fiberrik" och fiberdelen i makroraderna,
klassen `macro-fiber`). I komponenter
väljs färgen med en **ton** (`src/lib/tones.ts`): `tone="food"` → klassen `tone-food` → `--tone`, som
`ProgressBar`, `StatBar` och `GoalRing` använder. Grafer läser `--data-*` med `cssVar()`.

Äldre variabelnamn (`--ring-kcal`, `--dot-water`, `--chart-dose`, `--ok`, `--radius` …) är alias till
tokens ovan och tas bort när sista vyn flyttats.

### Ljust tema i en del av sidan (`theme-light`)

Klassen `theme-light` ger ljusa tokens (ytor, text, `--data-*`, alias) för ett element och allt i det, oavsett
`prefers-color-scheme`. Används av rapporten, som ska se ut som papper både på skärmen och i utskrift. Mörka tokens
ärvs inte in eftersom elementet deklarerar om variablerna.

### Storlekar och rörelse

| Token                  | Värde  |                                                 |
| ---------------------- | ------ | ----------------------------------------------- |
| `--tap-min`            | 44 px  | Minsta tryckyta (små knappar, chips)            |
| `--tap`                | 56 px  | Standardknappar, listrader                      |
| `--page-header-height` | 56 px  | Sticky sidhuvud                                 |
| `--duration-fast`      | 150 ms | Stängning, små tillståndsbyten                  |
| `--duration-base`      | 200 ms | Öppning av paneler, accordions, rubrikkrympning |
| `--ease-out`           |        | Standardkurva                                   |

Vid `prefers-reduced-motion: reduce` sätts båda längderna till 0 och alla animationer stängs av.

## Komponenter

| Komponent            | Fil                      | Används till                                                                      |
| -------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| `Page`               | `Page.tsx`               | Sidan: sticky rubrikrad som krymper vid scroll, fokus på rubriken vid sidbyte     |
| `Card`               | `Card.tsx`               | Yta med rubrik (+ valfri åtgärd och `tone`). Nästlat kort → grupp utan ram        |
| `ListRow`            | `ListRow.tsx`            | Rad: primär/sekundär text, högerställt värde, tryck, svep vänster/höger           |
| `SectionAccordion`   | `SectionAccordion.tsx`   | Hopfällbar sektion med rubrik, metatext, värde och åtgärder (måltider)            |
| `BottomSheet`        | `BottomSheet.tsx`        | Panel nerifrån (eller helskärm) som modal `<dialog>`                              |
| `ActionSheet`        | `ActionSheet.tsx`        | Radmeny: liten panel med ett val per rad, destruktiva val i fel-färg              |
| `DateBar`            | `DateBar.tsx`            | ‹ Idag › – datumrad med osynligt datumfält (Mat → Dag, formulär i paneler)        |
| Inställningslista    | `Card` + `ListRow`       | Grupp av rader med status och › som var och en öppnar en panel                    |
| `SegmentedControl`   | `SegmentedControl.tsx`   | Flikar/filter med `aria-pressed`; `size="small"` i sidhuvudet                     |
| `ChoiceList`         | `ChoiceList.tsx`         | Valrader: ett val av flera (radioknappar) med förklaring och egen markering       |
| `ChipGroup`          | `ChipGroup.tsx`          | Val som chips med fältetikett: biverkningar, veckodagar, injektionsställe         |
| `StatBar`            | `StatBar.tsx`            | "827 / 1 680 kcal" + tunn stapel i datatypens färg + metarad                      |
| `GoalRing` (Ring)    | `GoalRing.tsx`           | Ring mot dagsmål (dryck, kalorier, protein) med `tone`                            |
| `ProgressBar`        | `ProgressBar.tsx`        | Stapel med `tone`, `thin`, `decorative`; `segments` = uppdelad stapel             |
| `EmptyState`         | `EmptyState.tsx`         | Tomt läge: rubrik, förklaring och **en** knapp för nästa steg                     |
| `Toast`              | `Toast.tsx`              | Kvittens ovanför navigeringen med valfri Ångra; försvinner efter 8 s              |
| `useUndoToast`       | `lib/useUndoToast.ts`    | Tillstånd för en Toast med Ångra efter borttagning i en lista                     |
| `Skeleton`           | `Skeleton.tsx`           | Platshållare medan IndexedDB läses (ingen layout som hoppar)                      |
| `ShowMore`           | `ShowMore.tsx`           | "Visa fler" under en begränsad lista (med `useShowMore`)                          |
| `RangeFilter`        | `RangeFilter.tsx`        | Tidsfilter 1 mån / 3 mån / Allt som chips                                         |
| `DailyBarChart`      | `DailyBarChart.tsx`      | Stapelgraf, ett värde per dag i datatypens färg, valfri mållinje                  |
| `PeriodBar`          | `PeriodBar.tsx`          | ‹ Månad/vecka › – som `DateBar` men med en rubrik i mitten (Kalender)             |
| `Disclosure`         | `Disclosure.tsx`         | Hopfälld hjälptext bakom en liten dämpad textknapp (kalenderns förklaring)        |
| `Parts`              | `Parts.tsx`              | "6 000 steg · 827 kcal" – delarna hålls ihop, texten bryts bara vid "·"           |
| `BarcodeScanner`     | `BarcodeScanner.tsx`     | Kameravy för streckkoder (Mat, egna måltider, Tillskott) med reserver             |
| `BarcodeNotFound`    | `BarcodeNotFound.tsx`    | "Hittade inte [EAN]": AI från etikett / manuellt + länk till Open Food Facts      |
| `BarcodeElsewhere`   | `BarcodeElsewhere.tsx`   | Streckkoden finns på annat ställe (tillskott i Mat och tvärtom) – länk dit        |
| `AiJsonImport`       | `AiJsonImport.tsx`       | AI-flöden med JSON-svar: prompt (kopiera/dela) → klistra in → validering          |
| `AiLabelImport`      | `AiLabelImport.tsx`      | `AiJsonImport` för etiketter (tillskott per dos, livsmedel per 100 g)             |
| `RecipeImport`       | `RecipeImport.tsx`       | "Importera recept": länk/text → `AiJsonImport` → granskning (`…Review.tsx`)       |
| `IngredientEditor`   | `IngredientEditor.tsx`   | Ingrediensrader (mängd, enhet, Ta bort) + summa; egna måltider och recept         |
| `WeekBudgetRow`      | `WeekBudgetRow.tsx`      | Veckoraden under kcal-ringen/-stapeln: en rad, kvar och ≈ per dag → panel         |
| `WeekBudgetSheet`    | `WeekBudgetSheet.tsx`    | Veckopanelen: sju staplar mot dagsmålet, "ej loggad", kvar, per dag och saldo     |
| `SvgChart`           | `SvgChart.tsx`           | Statisk graf som SVG (linje, punkter, staplar) – rapporten och utskrift           |
| `PlateauCard`        | `PlateauCard.tsx`        | Översikt: platå, jämförelsetabell, 1–2 förklaringar, Fråga AI, Stäng              |
| `ReportDocument`     | `ReportDocument.tsx`     | Rapporten till vården: sidhuvud + en `Card` per sektion, `theme-light`            |
| `Macros`             | `Macros.tsx`             | "P 6 g · K 30 g · F 2 g · Fi 4 g" – fiber i fiberfärg, "–" saknas, "*" underkant  |
| `FiberNote`          | `FiberNote.tsx`          | Rad under fiberringen/-stapeln: veckans fibermål under upptrappningen             |
| `FiberMissingNote`   | `FiberMissingNote.tsx`   | Förklaringen bakom info-ikonen vid fibervärdet (poster utan fiberdata)            |
| `InfoButton`         | `InfoButton.tsx`         | Liten info-ikon (16 px, 44 px tryckyta) som fäller ut en förklaring               |
| `IconTipButton`      | `IconTipButton.tsx`      | Ikonknapp (48 px) med tooltip med namnet: långtryck och första gången             |
| `MealSettings`       | `MealSettings.tsx`       | Inställningar → Måltider: lista med dra-handtag (`useDragReorder`), panel per rad |
| `FoodSearchSettings` | `FoodSearchSettings.tsx` | Inställningar → Matsökning: källor, kategorier (förslag), dolda livsmedel         |
| `HydrationReminder`  | `HydrationReminder.tsx`  | Översikt: "Drick lite extra idag" när diarré/kräkning loggats (GLP-1)             |
| `RingAction`         | `RingAction.tsx`         | Ring på Översikt som går att trycka på (bildtexten är knappen/länken)             |
| `TodoCard`           | `TodoCard.tsx`           | Översikt: Att göra idag (tillskott, dos, pass, backup) eller "Allt klart"         |
| `MilestoneCard`      | `MilestoneCard.tsx`      | Översikt: kontextkortet "Ny milstolpe" (senaste veckan, kan stängas)              |
| `UpdateCard`         | `UpdateCard.tsx`         | Översikt: kontextkortet "Ny version finns" (toast på övriga sidor)                |
| `CalorieDetails`     | `CalorieDetails.tsx`     | Kaloriringens panel: mål, takt, förbrukning, spärrar, "Så räknas målet ut"        |
| `WeightDetails`      | `WeightDetails.tsx`      | Framsteg → Historik: förändring, kvar, BMI, när målet nås (viktkortet leder hit)  |

### Page (sidhuvud)

```tsx
<Page title="Mat" action={<SegmentedControl size="small" … />}>…</Page>
```

Rubrikraden är `position: sticky` med fast höjd (`--page-header-height`). När markören ovanför den
scrollats bort (`IntersectionObserver`) sätts `data-stuck="true"`: rubriken skalas ner med `transform`
(ingen layoutförändring) och raden får en linje. Sidor med egen sticky rad under (Mat: sökfältet)
lägger den på `top: var(--page-header-height)`. `scroll-padding-top` gör att element som scrollas fram
(fokus, ankare) hamnar under raden i stället för bakom den.

### Card

```tsx
<Card title="Snitt per vecka">…</Card>
<Card title="Blev passet av?" tone="warning" testId="missed-workouts">…</Card>
```

- Kort-i-kort är inte tillåtet. `Card` i `Card` ritas som `card-group` (ingen ram, linje mellan grupper),
  och kort i en `BottomSheet` förlorar sin ram – panelen är ytan.
- `tone` ger en 4 px vänsterkant i semantisk färg – inte en egen bakgrund eller tjock ram.
- En lista direkt i ett kort (`<ul className="list">`) går kant i kant.

### ListRow

```tsx
<ul className="list">
  <ListRow
    primary="Potatis kokt"
    secondary="200 g"
    value={<span className="kcal">160 kcal</span>}
    onClick={edit}
    swipeLeft={{ label: 'Ta bort', onSwipe: remove }}
    swipeRight={{ label: '★ Favorit', onSwipe: toggleFavorite }}
  />
</ul>
```

- Minst 56 px hög, primärtext kortas till två rader, värdet bryts aldrig.
- Svep med pekarhändelser (`useSwipe`, `touch-action: pan-y`): vänster glider ut och anropar
  `swipeLeft` (ska följas av en `Toast` med Ångra), höger studsar tillbaka. Ett svep räknas aldrig som tryck.
- `wrapValue`: ett långt värde ("Aptit 2 av 5 · Illamående") får brytas (högst 65 % av raden) i stället för att
  tränga undan rubriken – lägg det i `Parts` så att det bara bryts vid "·". `leading` kan vara en kalenderprick
  (`calendar-dot dot-<typ>`, 10 px) så att raden känns igen från kalendern.
- `href` i stället för `onClick` ger en länk; `chevron` visar › (öppnar något); `trailing` för en extra
  knapp (fäll ut ingredienser); `danger` = destruktivt val i en meny (fel-färg).
- `children` ligger under raden och följer med vid svep. Små detaljer (dostrappa) i
  `<ol className="list-row-details">` – dämpad text, värde till höger.
- **Tryck på raden** öppnar det man kan göra med den: finns ett formulär (vikt, midja, mående) läses
  posten in i formuläret ovanför; annars öppnas en `ActionSheet` (dos, schema, läkemedel). Formuläret
  har då "Ta bort …" längst ner som destruktiv textknapp (`button button-ghost button-small
button-danger-text`) – samma borttagning som svepet, så den nås utan svep (tangentbord,
  skärmläsare).

### SectionAccordion

```tsx
<SectionAccordion
  id="meal-lunch"
  title="Lunch"
  meta="2 poster"
  value={<span className="kcal">385 kcal</span>}
  expanded={open}
  onToggle={toggle}
  empty={count === 0}
  actions={<>⋯ +</>}
>
  <ul className="list">…</ul>
</SectionAccordion>
```

Rubrikraden är ett fast rutnät: **[pil] [namn + metatext] [värde] [⋯] [+]**. Pilen står till vänster om namnet
(pekar åt höger, roterar nedåt vid utfällning). Namnet och metatexten ("2 poster") är en rad som kortas med … –
inget i raden bryts. Värdet (kcal) är högerställt, `nowrap`, `tabular-nums` i en kolumn med fast minbredd
(`--accordion-value`, rymmer "1 234 kcal"), så pil och kcal står på samma x-position i alla sektioner (vaktas i
`e2e/mealHeaders.spec.ts`). Knappen täcker hela rubriken – tryck var som helst utom ⋯ och + fäller ut/ihop; ⋯ och +
(44 px) ligger ovanpå i sista kolumnen. `detail` = en dämpad rad under rubriken, indragen i linje med namnet
(måltidernas makron och fiber; en decimal under 10 g, hela gram från 10 g). Tom sektion = smal rad med namnet i samma
kolumn och bara `actions`. Innehållet glider in (200 ms, bara transform – ingen opacitet så att kontrasten alltid är
full).

### BottomSheet

- Öppnas med en kort glidning (32 px, 200 ms) och tonad bakgrund; stängs med glidning + tonas ut
  (150 ms). Stängningen har en timer som reserv så att panelen alltid stängs, även om animationens
  tidslinje står still.
- Grabber överst, rubrik + textknappen "Stäng" (ghost). Esc, "Stäng" eller tryck utanför stänger.
- Rubrikraden är sticky och får en 1 px linje (`data-stuck`) när innehållet scrollats under den – samma som
  sidhuvudet (`Page`). Gäller alla paneler, även helskärm (sök, analys, Fråga AI).
- `full` = helskärm (sök, analys, Fråga AI). Helskärmspanelen har sidans bakgrund (`--bg`); en `ListRow` i den
  följer den bakgrunden i stället för att ritas som ett ljust band.
- Menyer i en panel är `ListRow` med `chevron` (en rad per val) – inte en stapel knappar.
- En lista direkt i en panel (utan `Card`) har klassen `list list-flush`: raderna går kant i kant och
  första raden saknar linje (samma som `action-list` i menyer). Används för värden som "Version 0.1.0"
  i Om appen – etikett till vänster, värde till höger, i stället för `dl` med etikett och värde på
  varsin rad.
- Paneler kan staplas: en `ActionSheet` öppnas ovanpå en panel (unikt rubrik-id per panel). Att stänga
  den övre stänger bara den – `close` som bubblar genom React-trädet ignoreras.
- En `Toast` i en panel (Ångra efter svep) renderas i panelen och ligger längst ner i den
  (`.sheet .toast`), eftersom panelen täcker navigeringen.

### Formulär i en panel

```tsx
<div className="button-row">
  <button type="submit" className="button">Spara ändringar</button>
  <button type="button" className="button button-secondary" onClick={cancel}>Avbryt</button>
</div>
<details className="plan-details">…</details>
<button type="button" className="button button-ghost button-small button-danger-text" onClick={remove}>
  Ta bort posten
</button>
```

En fylld knapp (Spara …), eventuellt Avbryt som sekundär bredvid. "Ta bort …" är **sist** i panelen som destruktiv
textknapp – aldrig en helbreddsknapp med ram under Spara – och tar bort direkt med en `Toast` och Ångra (samma som
svepet). Gäller Logga-panelerna, Mat → Egna och Mats "Redigera post".

**Värden i en panel** (analysens nyckeltal, Om appen, Lagring) är `ListRow` med etiketten till vänster och värdet
till höger – ett förbehåll eller en rekommendation som `secondary` under etiketten, inte i värdet. Sektioner i en
helskärmspanel (Nyckeltal, Bytesförslag, Näringsinnehåll) är `Card`: i panelen utan ram, med en linje emellan.

### Sökfält

```tsx
<label className="search-field">
  <span className="visually-hidden">Sök livsmedel</span>
  <span aria-hidden="true" className="search-icon" />
  <input className="input" type="search" placeholder="Sök livsmedel" />
</label>
```

Förstoringsglaset (`search-icon`, ritat i CSS) står till vänster i fältet, i `--muted` – samma ikon som knappen
"Sök och logga mat" (`search-open`) som öppnar sök-sheeten. Streckkodsknappen ligger bredvid i `search-bar`.

### Inställningslista (lista → panel)

```tsx
<Card title="Appen">
  <ul className="list">
    <ListRow primary="Lås" secondary="Fingeravtryck eller skärmlås" value="Av" chevron onClick={…} />
  </ul>
</Card>
{open && <BottomSheet title="Lås" onClose={close}><LockSettings /></BottomSheet>}
```

Inställningar är grupper (`Card` med rubrik) av `ListRow` med `chevron`. Varje rad visar en kort status
(`value`: "7 av 7", "Av", "1 600 ml"; `secondary`: vad raden gäller) och öppnar sin grupp i en
`BottomSheet`. Panelen har högst **en** primärknapp (Spara …, Exportera). En delsökväg öppnar panelen
direkt (`#/installningar/profil`, `…/sakerhetskopia`) – länkar från andra vyer går dit.

Av/på-val är **switchar** (`label.switch-row` med `.switch-text` och `input.switch[role=switch]`), inte
kryssrutor med text efter: rubrik och förklaring till vänster, brytaren till höger på samma rad.

Ett val av flera (aktivitetsnivå, profilsida, importläge) är **valrader** (`ChoiceList`), inte webbläsarens
radioknappar – se nedan. Samma switchar används för val i en panel, t.ex. "Ta med" i Fråga AI: `fieldset.switch-group`
med `legend` och en `switch-list`; en förklaring ("Inte ifyllt – …") är `switch-description` och kopplas med
`aria-describedby`, så att switchens namn bara är rubriken.

### ChoiceList (valrader)

```tsx
<ChoiceList
  legend="Aktivitetsnivå"
  name="activity"
  options={[{ id: 'latt', label: 'Lätt aktiv', description: 'Promenader dagligen …' }, …]}
  value={level}
  onChange={setLevel}
/>
```

Samma form som switcharna: en rad per alternativ (minst `--tap`, linje emellan), etikett och valfri förklaring
till vänster, markeringen till höger. Markeringen är en egen radioknapp (`choice-radio`, `appearance: none`, 24 px,
ring i `--muted`, vald = fylld prick i `--accent`) – lika stor i ljust och mörkt tema. Under ytan är det vanliga
`<input type="radio">` i ett `<fieldset>` med `<legend>`, så piltangenter, `getByLabel(…).check()` och skärmläsare
fungerar. `dangerOption` färgar ett destruktivt val (Ersätt all data) i `--danger` när det är valt. Använd
`SegmentedControl` för att byta vy/filter, `ChoiceList` för en inställning där alternativen behöver förklaras.

### ActionSheet

```tsx
<ActionSheet
  title="Wegovy 0,25 mg"
  description="16 sep 08:05 · Buk vänster"
  actions={[{ label: 'Ta bort dosen', danger: true, onSelect: () => void remove(dose) }]}
  onClose={() => setMenu(null)}
/>
```

Valet stänger menyn och körs sedan. Ett destruktivt val tar bort direkt och följs av en `Toast` med
Ångra – ingen bekräftelse i två steg.

### DateBar

`<DateBar date={date} today={todayIso()} label="Datum" testId="log-date" onChange={setDate} />` –
ersätter `<input type="date">` i formulär där datumet inte får ligga i framtiden (vikt, midja, steg, dos,
mående). Texten är "Idag", "Igår" eller datumet; ‹ › byter dag, tryck på texten öppnar systemets
väljare. Formulär som planerar framåt (träningspass, scheman) behåller vanliga datumfält.

### Egna listor (Mat → Egna)

`Card` med rubrik och en **sekundär** knapp i rubrikraden ("Ny måltid", "Nytt livsmedel" – `button-secondary
button-small` via `action`), sedan en `list` med en `ListRow` per post: namn, sekundärtext (ingredienser eller
"Per 100 g · 7 g protein") och kcal till höger. Tryck = formuläret (med "Ta bort …" som destruktiv textknapp längst
ner), svep vänster = ta bort med `Toast` och Ångra. Ångra lägger tillbaka även favoritmarkeringen och de egna
enheterna, som borttagningen tar med sig. Inga fyllda knappar i vyn – primärknappen är Spara i formuläret.

### Lista → panel (Framsteg → Veckor)

```tsx
<Card title="Avslutade veckor">
  <ul className="list">
    <ListRow
      primary="Vecka 38"
      secondary={<Parts text="14 sep.–20 sep. · loggat 7 av 7 dagar" />}
      value={<span className="num">−0,7 kg</span>}
      chevron
      onClick={() => setOpen(week)}
    />
  </ul>
</Card>;
{
  open && (
    <BottomSheet title="Vecka 38 · 14 sep.–20 sep.">
      …detaljer… <button className="button button-secondary">Fråga AI om veckan</button>
    </BottomSheet>
  );
}
```

En lista av perioder eller poster med mycket innehåll var visar en rad per post (namn, kort metatext, ett nyckeltal
till höger, ›) och hela innehållet i en panel vid tryck. Åtgärder som gäller en post (Fråga AI) ligger **en gång** i
panelen – aldrig som en knapp per kort i listan. En panel ovanpå (Fråga AI i helskärm) staplas på den första.

### Logga-rutnät

Två kolumner med `log-tile` (`--radius-lg`, 12/16 px inre marginal, minst `--tap`): ikonen (28 px, datatypens färg
via `data-type`) och namnet (`--text-lg`) på samma rad, status (`--text-xs`, dämpad) under över hela bredden. Rutan
öppnar loggtypens panel. Inga ikoner ovanför texten – rutan ska inte vara högre än två textrader.

### Galleri (Framsteg → Bilder)

```tsx
<Card title="Fototillfällen" action={<button className="button button-secondary button-small">Nytt fototillfälle</button>}>
  <SegmentedControl label="Visa bilder" options={…} className="gallery-views" … />
  <ul className="list">
    <ListRow primary="Jämför tillfällen" secondary="Första mot senaste …" chevron onClick={compare} />
    <ListRow primary="22 sep. 2026" secondary="Morgon" value="87,6 kg" chevron onClick={edit}>
      <ul className="session-photos">…miniatyrer…</ul>
    </ListRow>
  </ul>
</Card>
```

Poster med bilder är `ListRow` (tryck = öppna posten) med bilderna som `children` i ett rutnät (`session-photos`, tre
kolumner, samma storlek som `photo-grid` per vinkel, `--space-2` mellanrum). Bilderna är egna knappar (helskärm), en tom
plats är en streckad ruta "+ Profil" (ett litet tomt läge). Ingen knapp per post. Tomt galleri = `EmptyState` med
"Nytt fototillfälle"; kort som bara beskriver innehållet (lagring) visas först när det finns något.

**Jämförelsen** öppnas från raden "Jämför tillfällen" i en helskärmspanel (`BottomSheet full`, "Jämför tillfällen";
"Stäng" avslutar): två val (från/till), `SegmentedControl` för vinkel och vy, skillnaden som **en** `ListRow` ("28
dagar mellan tillfällena", datum under, viktskillnad till höger) och bilderna. "Första mot senaste" är en liten
textknapp som bara visas när man valt något annat. Inga knappar i en kortrubrik.

**Helskärmsvyn** (`PhotoViewer`, svart modal `<dialog>`) följer panelmönstret: bildtexten och textknappen "Stäng"
överst, vinkeln som `SegmentedControl`, Äldre/Nyare som sekundära knappar och "Ta bort bilden" som destruktiv
textknapp längst ner. Borttagningen sker direkt och följs av en `Toast` med Ångra i vyn (`.viewer .toast`, längst
ner) – eller på sidan om det var den sista bilden. Ångra lägger tillbaka bilden och ett tillfälle som tömdes.

### Milstolpar

`ListRow` med märket som `leading` (`milestone-badge`, 40 px, `--text-xs`; nådd = `--accent`, kommande =
`milestone-badge-upcoming`, tonad `--track`). Kommande: `secondary` är en tunn `ProgressBar` (`milestone-progress`) och
`value` "0,1 kg kvar" (`milestone-remaining`, minsta bredd så att staplarna slutar lika). Uppnådda: datum som `value`.
Streckade ramar betyder tomt läge – inte "ej nådd".

### Nyckeltal och tät tabell

```tsx
<Card title="Senaste 7 dagarna">
  <div className="totals-row">
    <StatBar tone="food" … meta="658 kcal under målet" />
    <StatBar tone="protein" … meta="Målet nått" />
  </div>
  <p className="form-note muted">Snitt per loggad dag · 7 av 7 dagar loggade</p>
  <table className="table">…</table>
</Card>
```

Snitt mot mål visas som `StatBar` (samma som Mat → Dag) i stället för meningar i löptext. Gemensam förklaring
("Snitt per loggad dag …") är en dämpad rad under staplarna – metaraden i en `StatBar` bryts aldrig och ska vara kort.
`.table` är en tät tabell (`--text-sm`, 8/4 px cellmarginal) för data med flera kolumner per rad (dag, intag, mot mål,
protein; vikt och trend) – där en `ListRow` skulle tappa kolumnerna.

### PeriodBar

```tsx
<PeriodBar
  title="September 2026"
  titleId="calendar-period"
  prevLabel="Föregående månad"
  nextLabel="Nästa månad"
  onPrev={prev}
  onNext={next}
/>
```

Samma ramlösa pilar (48 px, `--accent`) som `DateBar`, men mitten är en rubrik (h2, `aria-live`) i stället för ett
datumfält. Ligger överst i kortet den styr. Inga inramade knappar för ‹ ›.

### Disclosure

`<Disclosure summary="Förklaring" testId="calendar-legend">…</Disclosure>` – `<details>` med en liten dämpad
textknapp (44 px, `--text-xs`) och en chevron som vänds. För hjälp man behöver en gång men som inte ska ta plats
varje gång. Hopfälld som standard; innehållet får inget eget kort.

### Parts

`<Parts text="Steg: 6 000 steg · Mat: 827 kcal" />` – varje del i `.nowrap`. Används i veckokortet, kalenderns
veckovy och dagsvyn (med `ListRow` `wrapValue`).

### Kalender (dagsvy)

En `Card` med dagen som rubrik ("Torsdag 24 sep. 2026") och **en** `list`: en `ListRow` per loggtyp (prick i
datatypens färg, värdet till höger) följt av en rad per pass (statusprick, typ · längd · intensitet, tid under,
statusmärke till höger). Tryck på ett pass = `ActionSheet` (Klar → `CompleteWorkoutSheet`, Hoppade över,
Markera som planerad, Ta bort passet); svep vänster = ta bort med Ångra. Inga knappar eller väljare i listan.

### useUndoToast

```tsx
const toast = useUndoToast();
async function remove(entry) {
  await deleteWeight(entry.id);
  await onChange();
  toast.show(`Tog bort ${formatKg(entry.weightKg)}.`, async () => {
    await putWeight(entry); // lägger tillbaka posten oförändrad
    await onChange();
  });
}
…
{toast.toast && (
  <Toast message={toast.toast.message} onUndo={toast.onUndo} onClose={toast.close} />
)}
```

Stäng kvittensen (`toast.close()`) när något nytt sparas, så att bara ett statusmeddelande syns åt gången.

### SegmentedControl

`size="small"` (44 px) i sidhuvudet, `regular` (48 px) i innehållet. Högst en segmentkontroll per nivå –
ett tidsfilter under flikarna ska vara `small` eller en rad chips. `value={null}` = inget alternativ valt (en bild
utan vinkel i helskärmsvyn).

I ett formulär: `showLabel` visar `label` som fältetikett ovanför (gruppen namnges av etiketten, `aria-labelledby`) i
stället för `<fieldset>` + `<legend>` runt egen markup – t.ex. Status (pass), Hur ofta (läkemedel), Aptit (mående).
Ett alternativ med kort etikett får `ariaLabel` ("Aptit 2" för "2"). Klick på det valda alternativet anropar
`onChange` igen, så ett valfritt val kan avmarkeras (aptit).

Fem flikar eller fler (Framsteg: Historik, Veckor, Bilder, Milstolpar, Rapport) får kolumner efter innehållet och
`--text-sm` så att alla syns på en mobil – ingen horisontell scroll.

### ChipGroup

```tsx
<ChipGroup
  label="Veckodagar"
  columns={7}
  options={[{ id: '0', label: 'mån', ariaLabel: 'måndag' }, …]}
  selected={['0', '2']}
  onToggle={toggleDay}
/>
```

Chips (`chip`, `aria-pressed`, vald = ram och text i `--accent`, som dryckens snabbval) under en fältetikett. Utan
`columns` radbryts chipsen (biverkningar); med `columns` blir de lika breda i ett rutnät (veckodagar 7,
injektionsställe 2). `hint` är en dämpad rad under etiketten ("Förslag"). Flerval och enkelval är samma komponent –
anroparen avgör vad `onToggle` gör. Inga egna knappstilar för val (tidigare `weekday-button`, `site-button`).

### Tidsfilter (RangeFilter)

`<RangeFilter value={range} onChange={setRange} />` – en rad chips (`chip-grid range-filter`, 44 px, `--text-sm`)
med `aria-pressed`, direkt under flikarna. Chips i stället för en andra segmentkontroll: filtret ska inte se ut som
en ny nivå flikar. Filtret gäller alla kort under det (Framsteg → Historik) eller hela fliken (Mat → Historik).

### Långa listor (ShowMore)

```tsx
const { shown, hidden, next, more } = useShowMore(rows); // 14 först, sedan 28 till per tryck
…
<ShowMore hidden={hidden} onClick={more}>Visa {next} dagar till</ShowMore>
```

En lista som växer med tiden (vikt dag för dag, midjemått) visar de 14 senaste. "Visa fler" är en liten textknapp
under listan och renderas inte när allt syns. Ge komponenten `key={range}` om listan ska börja om vid byte av
filter. Samma knapp (`ShowMore`) används för "Visa alla N obesvarade" på Översikt.

### Grafer

- uPlot med `baseAxes()` (dämpade axlar, svenska datum "13 sep." på tidsaxeln, minst 64 px per etikett) och
  `dateSeries()` (datum i legenden).
- Serien har datatypens färg (`--data-*`), mål är en streckad linje i `--chart-goal`.
- Ett värde per dag (steg, dryck): `DailyBarChart` med `colorVar`, `label`, `format`, `step` (avrundning av
  y-axelns tak) och valfri `goalOn(date)`. Vikt (`WeightChart`) och intag (`IntakeChart`) har egna grafer.
- Rapporten (utskrift, PDF) använder `SvgChart` i stället för uPlot: SVG är skarp i PDF och behöver ingen canvas.
  Serier: `points` (svaga dagsvärden), `line` (trend), `line-points` (midja, aptit), `bars` (steg). Legenden är
  `bar-legend` under grafen när det finns flera serier.
- Grafen ligger i ett `Card` med rubrik och `className="chart-card"`; sammanfattningen (snitt, mål nått) är en
  dämpad rad under grafen.

### StatBar och Ring

- `StatBar`: `value`, `goal`, `unit`, `tone`, `label` (skärmläsare), `meta` ("853 kcal kvar"). `mini`
  = mindre siffra, ingen metarad och stapeln dold för skärmläsare (för kopior, t.ex. Mats sticky rad).
  `title` sätter en rubrik till vänster på värdets rad och `display` en egen värdetext ("2,5 / 5 µg");
  `segments` ger en uppdelad stapel (se nedan).
- **Uppdelad stapel** (`ProgressBar segments`): delarna (`{ fraction, tone }`, andel av målet) ritas kant i kant
  i sina datafärger och kapas tillsammans vid 100 %. Används i Mat → Näring för mat (`food`) + tillskott
  (`supplement`) mot referensintaget, med en liten förklaring (`bar-legend`) överst i kortet.
- `GoalRing`: 96 px (`size="lg"` = 120 px, ensam ring i en panel), `tone`, siffran i mitten med enheten i mindre
  stil (`valueUnit`, 0,8 × siffran, halvfet) och "av …" under. Tre ringar på en rad (dryck, kalorier, protein) med
  bildtext under. På Översikt är ringen tryckbar via `RingAction`. Med fibermålet blir det fyra: `.rings-4` ger fyra
  lika breda kolumner där ringarna krymper med skärmen (högst 96 px, raden får gå ut `--space-2` i kortets marginal)
  och värdet utgår från `--text-sm` – aldrig två rader ringar.
- **Text i ringar** (regel): texten ska alltid rymmas inom ringens inre cirkel med marginal. Ringar ligger alltid i
  en `RingRow`, som mäter texten (`useRingFit`) och räknar ut en skala (`ringFit.ts`): varje textrads hörn ska ligga
  inom den inre radien (radie 38 av 96 minus 2 px). Skalan är **samma för alla ringar i raden**, styrd av den ring
  som behöver krympa mest, och sätts som `--ring-scale`. Ingen text går under `--ring-text-min` (11 px) – siffran
  stannar där enheten når min-storleken. Ryms texten ändå inte (extrema värden på mycket smala skärmar) beskärs den
  av den inre cirkeln i stället för att gå utanför ringen.
- **Kortformat i ringar**: dryck i liter med en decimal ("1,8 l", "av 2,5"; `formatLiters`), kalorier utan enhet
  (bildtexten säger "Kalorier"), protein och fiber i gram ("188 g", "av 210 g"). Skärmläsare får exakta värden
  (`valueText`, t.ex. "2 450 ml av 2 500 ml"); exakta ml visas i dryckespanelen och historiken.
- **Fibermål** i Mat → Dag och Mat → Historik: kalori-`StatBar` över hela bredden och protein + fiber bredvid varandra
  under (`totals-row-fiber`). Under ringen/staplarna en `FiberNote` (`form-note`): "Veckans fibermål: 21 g (mål 35 g)"
  under upptrappningen. Saknar poster fiberdata får fibervärdet en asterisk (*) och en `InfoButton` bredvid; förklaringen
  ("Dagens fiber kan vara i underkant – 2 poster saknar fiberdata …", `FiberMissingNote`) visas först efter tryck. Ingen
  varningsfärg.

### EmptyState

```tsx
<EmptyState
  title="Välkommen till Viktresan"
  action={{ label: 'Fyll i profilen', href: '#/installningar' }}
>
  Börja med startvikt, längd och mål …
</EmptyState>
```

Varje tomt läge säger vad som hamnar här och har en tydlig nästa handling.

### Toast

`<Toast message="Tog bort Potatis kokt." onUndo={undo} onClose={close} />` – "Ångra" är knappen, "Stäng"
en textknapp. Används efter varje destruktiv åtgärd i listor och efter snabbval (+250 ml).

### Kameravyer (CameraCapture, BarcodeScanner)

Helskärm i en modal `<dialog>` med svart bakgrund (`.camera`): rubrik och "Stäng" överst, bilden i mitten, kontroller
under. Knapparna är sekundära med vit ram. `BarcodeScanner` (`.camera.scanner`) lägger till ett sikte (`scanner-frame`),
ett tips i bilden när den är mörk (`scanner-tip`, "Mörkt, tänd lampan?"), ficklampa och zoom bara när kameran har dem
(`track.getCapabilities()`), tryck för fokus och en grön bock som kort bekräftelse vid träff. Reserverna "Skriv in
streckkod" (numeriskt tangentbord) och "Välj bild" ligger alltid under bilden. Kameraströmmen stängs vid träff, Stäng,
Esc och när appen döljs. En skanner som öppnas samtidigt med en panel renderas **efter** panelen (syskon), så att
dess `showModal` körs sist och den hamnar överst.

### Streckkodsflödet

Utfallet visas i panelen under sökfältet/listan: ingen träff = `BarcodeNotFound` (`Card` med två valrader med › och
en diskret länk `subtle-link`), träff på annat ställe = `BarcodeElsewhere` (en rad med länk). AI-importen
(`AiLabelImport`) har numrerade steg (`steps`), "Kopiera prompt" som primärknapp tills svaret är granskat – då blir
"Använd värdena" primär – och förhandsvisningen som `list list-flush` med värden till höger.

### Näringsetiketter och näringsvärden

- **Etiketterna** Proteinrik, Fiberrik och Energisnål (`ClaimTags`, EU:s näringspåståenden – `src/data/nutritionClaims.ts`)
  har samma form överallt: `tag tag-claim` efter namnet, texten i `--text` och ramen i datatypens färg – `--macro-protein`
  (Proteinrik), `--macro-fiber` (Fiberrik), `--data-food` (Energisnål, energi = mat). De visas i sökträffar, Senaste,
  Favoriter, Måltider, logg-sheeten (efter källan) och i Mat → Egna. Ingen etikett utan underlag.
- **Filter** i sök-sheeten: en rad `chip chip-small` (`aria-pressed`, `claim-filter`) direkt under sökfältet – samma chips
  som övriga val, ingen segmentkontroll. Dolda etiketter (Inställningar → Visning) får inget chip.
- **Status i logg-sheeten** (`NutritionStatus`): saknas något visas en rad med `tag tag-incomplete` ("Ofullständig
  näringsdata", ram i `--warning`, texten `--text`), en dämpad "Saknas: fiber, socker" och "Komplettera" som liten
  sekundärknapp till höger. Under den en hopfälld `plan-details` "Näringsvärden per 100 g" (utfälld när något saknas) med
  en `ListRow` per värde: namnet, källan eller "Eget värde" som `secondary`, värdet till höger – "saknas" dämpat.
- **Komplettera** (`NutritionCompleteForm`) ersätter loggformuläret i panelen: "Fota etiketten med AI" som `ListRow` med
  `chevron` överst, sex fält i två kolumner med ursprunget som dämpad rad under fältet, en primärknapp "Spara värden".
  Efteråt ligger erbjudandet att uppdatera tidigare loggar (`LogUpdateOffer`) som eget kort ovanför formuläret: chips för
  perioden med antal poster, "Uppdatera N poster" sekundär (loggformulärets Logga är primär) och "Inte nu" som ghost.

### Källetikett i sökträffar

Sökträffar och snabbval (`FoodList`) visar källan som en liten etikett först i detaljraden: `tag tag-source` med
"LV", "Fineli", "OFF" eller "Egen" (dämpad ram `--border` och text `--muted`, ingen datafärg – källan är metadata, inte
data). Skärmläsare får källans fulla namn ("Källa: Livsmedelsverket.", `visually-hidden`). Måltider, recept och
snabbloggar har ingen etikett – där står typen som text ("Måltid · …"). Samma livsmedel från flera databaser visas en
gång (Livsmedelsverket före Fineli).

### Mindre brus i matsökningen (Dölj, Ta bort, rankning)

- **Dölj** (`foodFilters.ts`): i sökträffar, Senaste och Favoriter (`FoodList`) sveper man vänster – texten "Dölj"
  syns bakom raden (samma svep och färg som `ListRow`) – och raden göms direkt med en `Toast` "Dolde X i sökningen." och
  Ångra. Långtryck (500 ms, `useLongPress`; även högerklick och menytangenten via `contextmenu`) öppnar en `ActionSheet`
  med livsmedlets namn och valet **Dölj**. Ett långtryck eller svep väljer aldrig livsmedlet.
- **Ta bort** gäller användarens egna livsmedel, måltider och recept i stället för Dölj: svep eller långtryck öppnar en
  `ActionSheet` som bekräftelse ("Ta bort X?", "Tas bort för gott … Tidigare loggar påverkas inte.") med **Ta bort** i
  fel-färg och Stäng. Undantag från regeln "ingen bekräftelse i två steg": borttagningen kan inte ångras härifrån.
  Stängs bekräftelsen glider raden tillbaka.
- **Inställningar → Matsökning** (`FoodSearchSettings`): tre `Card` i panelen – Källor (switchar för Livsmedelsverket,
  Fineli, Open Food Facts; "Egna livsmedel, måltider och recept visas alltid."), Kategorier (förslag "aldrig loggat: …"
  med den sekundära knappen "Dölj förslagen", sedan en switch per kategori med "N livsmedel · aldrig loggad"/"loggad N
  ggr"; på = visas) och Dolda livsmedel (sökfält + `ListRow` per livsmedel med källan som sekundärtext och textknappen
  "Återställ" som `trailing` – med Ångra i en `Toast`). Switcharna ändras direkt.
- **Rankning** (`foodRanking.ts`): egna och loggade först (användningspoäng: varje loggpost 1, halveras var 30:e dag),
  sedan exakt namnträff, sedan övriga. Högst tre träffar per närliggande variant (två första betydelsebärande orden,
  "Bröd fullkorn …"), sedan en textknapp i accentfärg "Visa fler varianter av Bröd fullkorn (2)" (`pick-more`, 44 px)
  på den sista visade variantens plats. Egna och loggade fälls aldrig ihop.
- Dolt och borttaget påverkar aldrig loggen, historiken, rapporten eller summeringar.

### Receptimport (Mat → Egna → Recept)

- Ingång: raden "Importera recept" (`ListRow` med `chevron`, överst i Recept-kortets lista – samma mönster som "Jämför
  tillfällen") och delningsmenyn (`#/mat/importera`). Panelen är en helskärms-`BottomSheet` ("Importera recept").
- AI-steget är `AiJsonImport` med fältet "Länk eller receptext" överst och en dämpad rad om vad som skickas med (länk,
  text eller "bifoga en bild"). "Kopiera prompt" är primär tills svaret är granskat, sedan "Granska ingredienser".
- Granskningen (`RecipeImportReview`): namn och portioner som fält, källan som dämpad rad med länk, `Card`
  "Ingredienser" med en sammanfattning ("5 ingredienser · 2 att granska") och en `ListRow` per ingrediens:
  originaltexten som `primary`, "Livsmedel · 400 g" + säkerhetsetikett som `secondary`, kcal till höger, `chevron`.
  Etiketten är `tag tag-confidence-*` med ram i semantisk färg: `--success` Säker, `--warning` Osäker, `--danger` Ingen
  träff – texten är alltid `--text`. Tryck = sök-sheeten (förifylld sökning och mängd, skanner). "Hoppa över" är ett
  litet chip (`chip chip-small`, `aria-pressed`) under raden, bara för salt/peppar/vatten/"efter smak", rader utan träff
  och överhoppade rader; en överhoppad rad är överstruken och dämpad. Under kortet "Per portion" och "Hela receptet" som
  `list list-flush`. En primärknapp: "Spara recept"; "Tillbaka" sekundär.

### Tillskott

Dagens tillskott är chips (`ChipGroup`, `hideLabel` när kortets rubrik redan säger det): tryck = tagen/inte tagen,
vid behov med `hint`. "Alla tagna" är en sekundär liten knapp i kortets rubrikrad och följs av en `Toast` med Ångra.
Formuläret (`SupplementForm`) har enhet som chips, näringsämnen som rader (mängd, enhet – bara D-vitamin har ett val,
µg/IE med omräkning – och "Ta bort") och "+ Lägg till näringsämne" som en `select`.

### Gapraden och "Vad ska jag äta?" (Mat → Dag)

- **Gapraden** (`gap-line`) ligger i summeringskortet direkt under staplarna, före makroraden (ensam på raden): "41 g protein och 6 g fiber
  kvar" i `--text-sm`, fetstil, `tabular-nums`. Bara näringsämnen med mer än 10 % kvar av målet, störst andel först; är
  allt inom 10 % visas ingen rad. Bara för idag. Saklig ton – information, inte uppmaningar. Fiber räknas mot veckans
  fibermål, annars referensvärdet, och först när fiberdatan är läst.
- **"Vad ska jag äta?"** är en ikonknapp med gnistor (`IconTipButton` + `SparklesIcon`, `icon-button what-to-eat-button`
  i `--accent`) i datumraden direkt till vänster om ⋯ – bara idag, aldrig en primärknapp. Tryckytan är 48 px och namnet
  finns i `aria-label`. Långtryck (500 ms) visar namnet som en kort tooltip (`icon-tip`: `--text` på `--bg`, `--text-xs`,
  `--shadow-md`, under knappen, högerställd, `pointer-events: none`) utan att öppna; samma tooltip visas automatiskt första
  gången knappen syns (`preferences.whatToEatTipSeen`). Den försvinner efter 4 s eller vid nästa tryck/scroll. I
  måltidssektionerna finns valet bara överst i ⋯-menyn (`ListRow` med `chevron` och förklaring); idag visas ⋯ även på tomma
  måltider. Ikonen gäller pågående måltid (tiden närmast före klockslaget), menyn den valda måltiden.
- **Panelen** (`BottomSheet` i helskärm, "Vad ska jag äta till lunch?") är `AskAi`: samma kryssrutor (innehållet heter
  "Kvar idag och vanliga livsmedel"), förhandsvisning, Dela, Kopiera och Öppna i ChatGPT/Claude. Appen skickar inget.
- **Sök-sheeten**: när protein- eller fibergapet är stort står chipet Proteinrik/Fiberrik först i filterraden (störst gap
  först) – aldrig förvalt.

### Ändra ordning (Inställningar → Måltider)

- Listan är `list list-flush` med en `ListRow` per måltid: namn, "07:00 · Huvudmåltid" som `secondary` och ett
  **dra-handtag** (sex prickar, `drag-handle`, 56 × 44 px, `--muted`, `touch-action: none`) som `trailing` till höger.
  Tryck på raden = panel med formuläret (Namn, Ungefärlig tid, Typ som `ChoiceList`, primärknappen "Spara måltid", "Ta bort
  måltiden" som destruktiv textknapp). Svep vänster = ta bort.
- Dra i handtaget (`useDragReorder`): raden följer fingret (`ListRow` `dragOffset`, `--shadow-md`, handtaget i `--accent`) och
  byter plats med grannen vid halva radhöjden; ordningen sparas när den släpps. Piltangenterna på handtaget flyttar ett steg
  och platsen läses upp (`role="status"`). Sekundärknappen "Lägg till måltid" står under listan.
- Ta bort en måltid med poster: en panel frågar vart posterna ska flyttas (`ChoiceList`, förval närmaste i tid) med
  `button-danger` "Ta bort och flytta posterna". En tom måltid tas bort direkt. Båda ger `Toast` med Ångra. Den sista
  måltiden kan inte tas bort.

### Snabblogg, recept och veckoraden

- **Snabblogg** är en vanlig `ListRow` i dagsvyn med etiketten `tag tag-estimated` ("uppskattat", dämpad ram och text –
  ingen datafärg) efter namnet och protein som `secondary`. Den öppnas från raden "Snabblogg" (`ListRow` med `chevron`)
  överst i sök-sheeten, även via måltidens +. Formuläret (`QuickLogForm`) har samma form som `FoodLogForm`: stjärnan i
  rubrikraden, en primärknapp och "Ta bort posten" sist vid redigering.
- **Recept** ligger som eget `Card` under Mat → Egna (samma mönster som Måltider). `RecipeBuilder` använder
  `IngredientEditor` och visar näringen som `list list-flush` med `ListRow` ("Per portion", "Per 100 g", värdet till
  höger). "Duplicera recept" är en ghost-textknapp ovanför den destruktiva "Ta bort receptet". Sök-sheeten öppnas
  **utanför** formuläret (syskon), eftersom den har egna formulär. Portioner loggas med chips ½ · 1 · 1½ · 2.
- **Veckoraden** (`WeekBudgetRow`) ligger inuti summeringskortet (Mat → Dag) och Idag-kortet (Översikt) under en 1 px
  linje – aldrig som eget kort i ett kort. Samma kompakta rad på båda ställena: "Vecka: 9 441 kcal kvar · ≈ 1 804/dag"
  som en knapp (minst `--tap-min`, › till höger) i `--text-sm` (`--text-xs` under 380 px så att den ryms på en rad).
  Saldo, intag och golvnotis finns i veckopanelen. Saldot är **neutralt** – aldrig `--success`/`--danger`, bara
  tecknet (+/−/±) visar riktningen. Golvnotisen (`WeekShortfallNote`) är en saklig `form-note` utan varningsfärg: den
  föreslår att sprida resten över nästa vecka, aldrig att äta under golvet.
- **Veckopanelen** (`WeekBudgetSheet`, `BottomSheet`): sju staplar (`week-chart`, `ol` med en `li` per dag och uppläst
  text i `visually-hidden`) i matens färg mot dagsmålet som streckad linje (`--chart-goal`). Värdet står över stapeln,
  veckodagen under (idag i fetstil). En passerad dag utan matlogg har streckad ram och "ej loggad", kommande dagar "–".
  Under: förklaringsrad och värden som `list list-flush` + `ListRow` (Loggat, Kvar, Per dag resten av veckan, Saldo).

### Översikt

Status och det som kräver handling idag – detaljer ett tryck bort. En vanlig dag ryms på ungefär 1,5 skärmhöjder
(Pixel 7, vaktas i `e2e/overview.spec.ts`). Ordning:

1. **Viktkortet** (`hero-card`): trendvikten i `--text-xl`, dagsvikt och datum som en rad `--text-xs`, tunn
   `ProgressBar` och **en** rad under: "−4,5 kg · 7,5 kg kvar · mål ca dec. 2026". Måldatumet är trendens prognos
   när den räcker, annars datumet enligt vald takt med "enligt plan" (`goalEta`) – aldrig två datum eller en text om
   att prognosen saknas. Förklaringen om vätska och salt ligger bakom info-ikonen. Hela kortet är en länk (`hero-link`,
   `::after` över kortet, › uppe till höger) till Framsteg → Historik, där `WeightDetails` visar BMI och prognosen.
2. **Kontextkort** – bara när de är aktuella, alla kan stängas: ny version (`UpdateCard`), ny milstolpe
   (`MilestoneCard`), förra veckan (`WeekSummaryCard`, en rad med rubriken → Framsteg → Veckor), platå
   (`PlateauCard`), dryckespåminnelse och övre gränsvärden.
3. **Idag**: ringarna (`RingAction`) – dryck öppnar en panel med snabbvalen, kalorier `CalorieDetails` i en panel,
   protein och fiber Mat → Näring. Under: chips för steg och träning (bara med data idag, `today-chip` med
   kalenderprick) och veckoraden i kort form (`WeekBudgetRow compact`: "Vecka: 7 771 kcal kvar · ≈ 2 150/dag").
4. **Att göra idag** (`TodoCard`): `ListRow` per sak som väntar – dos (länk till Logga → GLP-1), tillskott (tryck =
   tagen, Toast med Ångra; "Alla tagna" i rubrikraden vid fler än ett), pass med Klar / Hoppa över under raden,
   "Blev passet av?" och säkerhetskopian. Tomt → kortet ersätts av raden "Allt klart för idag" (bock i `--success`).
   Nästa dos (ej dosdag) är en liten dämpad rad längst ner: "Nästa dos lör 26 sep · 2,5 mg · buk vänster".

Inställningar → Översikt (`OverviewSettings`, switchar) döljer enskilda ringar, veckoraden och korten
(`preferences.overviewHidden`); viktkortet visas alltid.

### Dryckespåminnelse (Översikt, GLP-1)

`HydrationReminder`: `Card` med `tone="warning"`, rubriken "Drick lite extra idag" och en saklig mening om vad som
loggats (diarré, kräkning), att kroppen förlorar vätska och när man bör kontakta vården. Ingen knapp och ingen
målhöjning – bara dagen biverkningen loggades.

### Platåkortet (Översikt)

`Card` med `tone="info"` och "Stäng" (ghost, liten) i rubrikraden. En saklig mening om trendvikten, sedan en `.table`
med de senaste tre veckorna mot de tre innan (rader med `feature`, filtreras), dosbyten som dämpad rad, rubriken
"Det här kan förklara platån" med högst två förklaringar som punktlista, alltid notisen om vätska och mätbrus och
"Fråga AI om platån" som sekundär knapp (helskärmspanel med `AskAi`). Formuleringar beskriver vad datan visar – aldrig
vad användaren "borde" ha gjort.

### Rapport (Framsteg → Rapport)

- **Val** (`ReportSettingsForm`, ett `Card` med `.form`): period som `ChipGroup` (två kolumner, enkelval), egen period
  = två datumfält i `field-row`, perioden som dämpad rad, sektioner som switchar (`switch-group`) med förklaring.
  "Visa rapport" är vyns enda primärknapp (inaktiv utan giltig period eller sektion). Valen sparas direkt.
- **Rapportvyn** (`#/framsteg/rapport/visa`): verktygsrad (`report-toolbar no-print`) med "Ändra urval" (sekundär) och
  "Spara som PDF" (primär, `window.print()`; första gången en panel med instruktion och "Fortsätt"). Under den
  `ReportDocument` (`article.report.theme-light`): rubrik, period och skapad-datum, sedan en `Card` per sektion med
  värden som `list list-flush` + `ListRow`, tabeller som `.table` med `caption` och grafer som `SvgChart`.
- **Utskrift** (`@media print`, `@page { size: A4 }`): allt utom rapporten döljs (sidhuvud, navigering, flikar,
  `.no-print`, paneler), korten tappar ram, varje sektion börjar på ny sida och får sidhuvudet (`report-running-head`:
  period och skapad-datum) överst. Grafer, tabeller och rader bryts inte mitt i. Grafen är högst 120 mm bred så att
  texten får samma storlek som på mobilen.

### Skeleton

`<Skeleton hero cards={3} />` medan `data === null`. Pulserar långsamt (av vid reducerad rörelse) och
läser upp "Laddar …".

## Regler

1. **Tryckytor minst 44 px** (`--tap-min`); vanliga knappar och rader 56 px (`--tap`).
2. **En primärknapp per vy.** Fyllda knappar (`.button`) bara för den viktigaste handlingen – Spara i en
   panel, nästa steg i ett tomt läge. Övrigt: `.button-secondary` (ram), `.button-ghost` (text) eller
   chips. Snabbval (dryck) är chips – även i Logga → Dryck; "Klar" på ett pass är sekundär. Stegknappar
   bredvid ett fält (±0,1 kg) är små och sekundära på samma rad som fältet (`.nudge-field`).
3. **Destruktiva åtgärder** ligger i en panel (längst ner, i fel-färg) eller som svep med Ångra – aldrig som
   knappar i listor.
4. **Tomma lägen** har en tydlig nästa handling (`EmptyState` med `action`).
5. **Inga radbrytningar i siffror och enheter** (`.num`, `.nowrap`, `.kcal`).
6. **Inget kort-i-kort** (`Card` sköter det).
7. **Färger**: data i `--data-*`, status i `--success`/`--warning`/`--danger`, interaktion i `--accent`.
   Inga hårdkodade färger i komponenter.
8. **Inget horisontellt överflöde**: `.app-main` har `overflow-x: clip` som skyddsnät – men innehåll ska
   kunna brytas eller krympa (`min-width: 0`).

## Mikrointeraktioner

| Var              | Vad                                                       | Längd        |
| ---------------- | --------------------------------------------------------- | ------------ |
| BottomSheet      | Glider upp 32 px + bakgrund tonas in / glider ner         | 200 / 150 ms |
| SectionAccordion | Innehåll glider in 6 px (ingen opacitet), chevron roterar | 200 ms       |
| ListRow          | Svepet följer fingret; släpps → glider tillbaka/ut        | 200 ms       |
| ActionSheet      | Som BottomSheet, ovanpå den öppna panelen                 | 200 / 150 ms |
| Sidhuvud         | Rubriken krymper (`scale(0.72)`), linje under             | 200 ms       |
| Skeleton         | Pulserar                                                  | 1,4 s        |
| Skanner          | Träff: kameran stängs, bock + vibration, sedan stängs vyn | 600 ms       |

**Haptik** (`src/lib/haptics.ts`): `haptic('success')` (12 ms) vid spara/klar – vikt, midja, steg, pass,
dos, mat (loggad/ändrad), "Markera som klar" och streckkodsträff – och `haptic('light')` (6 ms) vid snabbval (+250 ml) och avbockat tillskott. Av om
**Inställningar → Visning → Vibration vid spara** är avslaget, vid `prefers-reduced-motion` och där
`navigator.vibrate` saknas (t.ex. iOS). Inställningen lagras i `preferences.haptics` (enheten).

**`prefers-reduced-motion`**: tokens `--duration-*` = 0, alla CSS-animationer och övergångar av,
`BottomSheet` stänger direkt, ingen konfetti, ingen haptik.

## Visuella regressionstester

`e2e/visual.spec.ts` tar skärmdumpar av varje vy och de viktigaste panelerna i ljust och mörkt tema, med
fast testdata och fryst datum (`e2e/visualData.ts`: torsdag 2026-09-24 12:30, Europe/Stockholm).
Baslinjerna ligger i `e2e/__screenshots__/` och är tagna i Playwrights Docker-avbild
(`mcr.microsoft.com/playwright:v1.63.0-noble`) – typsnitt och Chromium måste vara identiska.

```sh
npm run test:visual          # jämför (kör Docker lokalt, direkt i CI)
npm run test:visual:update   # nya baslinjer efter en avsiktlig ändring – granska bilderna och committa
```

CI-jobbet "Visuella regressionstester" kör i samma avbild och laddar upp skillnaderna som artefakt när
det fallerar. Byt avbildens version i `scripts/visual.sh`, `.github/workflows/ci.yml` och i
`@playwright/test` samtidigt, och uppdatera baslinjerna.

## Flytta en vy till systemet

1. `Page` + `Card`/`SectionAccordion`, inga egna kort-klasser.
2. Listor → `ListRow`; ta bort Redigera/Ta bort-knappar (tryck/svep + `Toast` med Ångra).
3. Värden mot mål → `StatBar`/`GoalRing` med rätt `tone`.
4. Tomt läge → `EmptyState` med `action`, laddning → `Skeleton`.
5. Bara tokens i CSS (`--space-*`, `--text-*`, `--radius-*`, `--data-*`).
6. `npm run test:visual:update`, granska diffen, committa baslinjerna.
