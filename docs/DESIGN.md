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

| Token             | Datatyp | Ljust     | Mörkt     | Syns i                                            |
| ----------------- | ------- | --------- | --------- | ------------------------------------------------- |
| `--data-weight`   | Vikt    | `#0f766e` | `#2dd4bf` | Viktgraf, målstapel, kalenderprick, Logga-ikon    |
| `--data-food`     | Mat     | `#c2410c` | `#fb923c` | Kaloriring/-stapel, intagsgraf, kalenderprick     |
| `--data-drink`    | Dryck   | `#0284c7` | `#38bdf8` | Dryckesring, dryckeshistorik, kalenderprick, ikon |
| `--data-steps`    | Steg    | `#7c3aed` | `#c4b5fd` | Stegdiagram, kalenderprick, ikon                  |
| `--data-training` | Träning | `#4d7c0f` | `#a3e635` | Kalenderprick, ikon                               |
| `--data-dose`     | Dos     | `#4338ca` | `#a5b4fc` | Dosbyten i viktgrafen, kalenderromb, ikon         |
| `--data-waist`    | Midja   | `#db2777` | `#f472b6` | Kalenderprick, ikon                               |
| `--data-mood`     | Mående  | `#a16207` | `#fde047` | Kalenderprick                                     |

Protein har `--macro-protein` (samma teal som vikt, men används bara i matens detaljer). I komponenter
väljs färgen med en **ton** (`src/lib/tones.ts`): `tone="food"` → klassen `tone-food` → `--tone`, som
`ProgressBar`, `StatBar` och `GoalRing` använder. Grafer läser `--data-*` med `cssVar()`.

Äldre variabelnamn (`--ring-kcal`, `--dot-water`, `--chart-dose`, `--ok`, `--radius` …) är alias till
tokens ovan och tas bort när sista vyn flyttats.

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

| Komponent          | Fil                    | Används till                                                                  |
| ------------------ | ---------------------- | ----------------------------------------------------------------------------- |
| `Page`             | `Page.tsx`             | Sidan: sticky rubrikrad som krymper vid scroll, fokus på rubriken vid sidbyte |
| `Card`             | `Card.tsx`             | Yta med rubrik (+ valfri åtgärd och `tone`). Nästlat kort → grupp utan ram    |
| `ListRow`          | `ListRow.tsx`          | Rad: primär/sekundär text, högerställt värde, tryck, svep vänster/höger       |
| `SectionAccordion` | `SectionAccordion.tsx` | Hopfällbar sektion med rubrik, metatext, värde och åtgärder (måltider)        |
| `BottomSheet`      | `BottomSheet.tsx`      | Panel nerifrån (eller helskärm) som modal `<dialog>`                          |
| `ActionSheet`      | `ActionSheet.tsx`      | Radmeny: liten panel med ett val per rad, destruktiva val i fel-färg          |
| `DateBar`          | `DateBar.tsx`          | ‹ Idag › – datumrad med osynligt datumfält (Mat → Dag, formulär i paneler)    |
| `SegmentedControl` | `SegmentedControl.tsx` | Flikar/filter med `aria-pressed`; `size="small"` i sidhuvudet                 |
| `StatBar`          | `StatBar.tsx`          | "827 / 1 680 kcal" + tunn stapel i datatypens färg + metarad                  |
| `GoalRing` (Ring)  | `GoalRing.tsx`         | Ring mot dagsmål (dryck, kalorier, protein) med `tone`                        |
| `ProgressBar`      | `ProgressBar.tsx`      | Stapel med `tone`, `thin`, `decorative` (dold för skärmläsare)                |
| `EmptyState`       | `EmptyState.tsx`       | Tomt läge: rubrik, förklaring och **en** knapp för nästa steg                 |
| `Toast`            | `Toast.tsx`            | Kvittens ovanför navigeringen med valfri Ångra; försvinner efter 8 s          |
| `useUndoToast`     | `lib/useUndoToast.ts`  | Tillstånd för en Toast med Ångra efter borttagning i en lista                 |
| `Skeleton`         | `Skeleton.tsx`         | Platshållare medan IndexedDB läses (ingen layout som hoppar)                  |

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

Tom sektion = smal rad med bara rubrik och `actions`. Innehållet glider in (200 ms, bara transform – ingen opacitet så att kontrasten alltid är full), chevronen roterar.

### BottomSheet

- Öppnas med en kort glidning (32 px, 200 ms) och tonad bakgrund; stängs med glidning + tonas ut
  (150 ms). Stängningen har en timer som reserv så att panelen alltid stängs, även om animationens
  tidslinje står still.
- Grabber överst, rubrik + textknappen "Stäng" (ghost). Esc, "Stäng" eller tryck utanför stänger.
- `full` = helskärm (sök, analys, Fråga AI).
- Menyer i en panel är `ListRow` med `chevron` (en rad per val) – inte en stapel knappar.
- Paneler kan staplas: en `ActionSheet` öppnas ovanpå en panel (unikt rubrik-id per panel). Att stänga
  den övre stänger bara den – `close` som bubblar genom React-trädet ignoreras.
- En `Toast` i en panel (Ångra efter svep) renderas i panelen och ligger längst ner i den
  (`.sheet .toast`), eftersom panelen täcker navigeringen.

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
ett tidsfilter under flikarna ska vara `small` eller en rad chips.

### StatBar och Ring

- `StatBar`: `value`, `goal`, `unit`, `tone`, `label` (skärmläsare), `meta` ("853 kcal kvar"). `mini`
  = mindre siffra, ingen metarad och stapeln dold för skärmläsare (för kopior, t.ex. Mats sticky rad).
- `GoalRing`: 96 px, `tone`, värde i mitten och "av …" under. Tre ringar på en rad (dryck, kalorier,
  protein) med bildtext under.

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

**Haptik** (`src/lib/haptics.ts`): `haptic('success')` (12 ms) vid spara/klar – vikt, midja, steg, pass,
dos, mat (loggad/ändrad), "Markera som klar" – och `haptic('light')` (6 ms) vid snabbval (+250 ml). Av om
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
