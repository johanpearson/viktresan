/**
 * Standardenheter för vanliga livsmedel i Livsmedelsverkets databas.
 *
 * VÄRDENA ÄR UNGEFÄRLIGA. De är sammanställda för Viktresan utifrån svenska
 * hushållsmått (1 dl = 100 ml, 1 msk = 15 ml, 1 tsk = 5 ml) omräknade med
 * typisk densitet, samt medelstorlekar och skivtjocklekar som de brukar anges i
 * receptsamlingar, på förpackningar och i Livsmedelsverkets portionsuppgifter.
 * De är inte hämtade ur en officiell tabell och varierar mellan sorter, märken
 * och hur man mäter (t.ex. hur hårt ett dl-mått packas). Ätlig del utan skal
 * och kärnor avses för frukt och grönsaker; ägg avses utan skal.
 *
 * Matchning (se `standardUnitsFor` i `src/lib/units.ts`):
 * - `ids`: Livsmedelsverkets livsmedelsnummer (`lv:<nummer>`), matchar direkt.
 * - `pattern`: reguljärt uttryck mot det normaliserade namnet – gemener,
 *   å/ä → a, ö → o, skiljetecken → mellanslag (`normalize` i foodSearch.ts).
 *   "Ägg kokt" matchas alltså som "agg kokt".
 * - `exclude`: namn som matchar detta hoppas över (t.ex. friterat, torkat).
 * Första regeln som matchar gäller. Mer specifika regler står därför först.
 */

export interface StandardUnitRule {
  /** Vad regeln gäller, för läsaren av tabellen. */
  label: string;
  ids?: readonly number[];
  pattern?: RegExp;
  exclude?: RegExp;
  units: readonly { name: string; grams: number }[];
}

const SPREAD = [
  { name: 'msk', grams: 14 },
  { name: 'tsk', grams: 5 },
];

const OIL = [
  { name: 'msk', grams: 14 },
  { name: 'tsk', grams: 4.5 },
];

const JAM = [
  { name: 'msk', grams: 20 },
  { name: 'tsk', grams: 7 },
];

/** Tillagat, torkat, konserverat m.m. – då stämmer inte styckvikten för råvaran. */
const PROCESSED =
  /(friterad|stekt|torkad|torkat|konserv|juice|saft|sylt|mos|soppa|sallad|chips|puré|pure|stuvad|gratang|pulver|dryck|smoothie|paj|kaka|glass)/;

export const STANDARD_UNIT_RULES: readonly StandardUnitRule[] = [
  // --- Ägg ---------------------------------------------------------------
  {
    label: 'Ägg (kokt, rått, stekt), medelstort utan skal',
    pattern: /^agg (kokt|ratt|stekt)/,
    units: [{ name: 'st', grams: 60 }],
  },

  // --- Frukt och bär -----------------------------------------------------
  { label: 'Banan, skalad', pattern: /^banan$/, units: [{ name: 'st', grams: 120 }] },
  {
    label: 'Äpple, medelstort',
    pattern: /^apple /,
    exclude: PROCESSED,
    units: [{ name: 'st', grams: 150 }],
  },
  { label: 'Päron, medelstort', pattern: /^paron$/, units: [{ name: 'st', grams: 150 }] },
  { label: 'Apelsin, skalad', pattern: /^apelsin$/, units: [{ name: 'st', grams: 150 }] },
  { label: 'Kiwi, skalad', pattern: /^kiwi (gron|gul)$/, units: [{ name: 'st', grams: 75 }] },
  {
    label: 'Avokado, utan skal och kärna',
    pattern: /^avokado$/,
    units: [{ name: 'st', grams: 150 }],
  },

  // --- Grönsaker och potatis --------------------------------------------
  {
    label: 'Körsbärstomat',
    pattern: /^tomat korsbarstomat/,
    units: [{ name: 'st', grams: 15 }],
  },
  { label: 'Tomat, medelstor', pattern: /^tomat$/, units: [{ name: 'st', grams: 100 }] },
  {
    label: 'Gurka, hel respektive skiva',
    pattern: /^gurka$/,
    units: [
      { name: 'st', grams: 350 },
      { name: 'skiva', grams: 5 },
    ],
  },
  { label: 'Morot, medelstor', pattern: /^morot( kokt|$)/, units: [{ name: 'st', grams: 75 }] },
  { label: 'Lök, medelstor', pattern: /^lok (gul|rod)$/, units: [{ name: 'st', grams: 100 }] },
  {
    label: 'Paprika, medelstor',
    pattern: /^paprika (gron|gul|rod)$/,
    units: [{ name: 'st', grams: 150 }],
  },
  {
    label: 'Potatis, medelstor (rå eller kokt)',
    pattern: /^potatis .*\b(ra|kokt)\b/,
    exclude: /(stekt|stuvad|gratang|bakad|konserv|frysvara|mos|bullar|tarnad|hasselback)/,
    units: [{ name: 'st', grams: 90 }],
  },

  // --- Bröd -------------------------------------------------------------
  {
    label: 'Knäckebröd och annat hårt bröd',
    pattern: /^hart brod/,
    units: [{ name: 'skiva', grams: 12 }],
  },
  {
    label: 'Mjukt bröd (limpa, formfranska m.m.)',
    pattern: /^brod /,
    exclude: /(tortilla|croissant|giffel|scones|chapati|pitabrod|baguette|krutong)/,
    units: [{ name: 'skiva', grams: 35 }],
  },

  // --- Ost och pålägg ---------------------------------------------------
  {
    label: 'Hårdost, hyvlad skiva',
    pattern: /^ost hardost/,
    exclude: /parmesan/,
    units: [{ name: 'skiva', grams: 10 }],
  },
  {
    label: 'Skivat pålägg (skinka, kalkon, salami, leverpastej)',
    pattern: /^(gris skinka (skivad|rokt|lufttorkad)|kalkon rokt|palaggskorv|leverpastej skivbar)/,
    units: [{ name: 'skiva', grams: 10 }],
  },

  // --- Mejeri och drycker (dl) -----------------------------------------
  {
    label: 'Mjölk och växtdryck',
    pattern: /^(mjolk fett|mellanmjolk|lattmjolk|havredryck)/,
    units: [
      { name: 'dl', grams: 103 },
      { name: 'glas', grams: 206 },
    ],
  },
  {
    label: 'Fil och yoghurt',
    pattern: /^(filmjolk|yoghurt (naturell|mild|smaksatt))/,
    units: [{ name: 'dl', grams: 105 }],
  },
  {
    label: 'Kvarg',
    pattern: /^kvarg (farskost|naturell|smaksatt)/,
    units: [{ name: 'dl', grams: 110 }],
  },
  {
    label: 'Crème fraiche och grädde',
    pattern: /^(creme fraiche|matlagningsgradde|vispgradde fett)/,
    units: [
      { name: 'dl', grams: 100 },
      { name: 'msk', grams: 15 },
    ],
  },

  // --- Gryn, flingor, ris och pasta (dl) --------------------------------
  { label: 'Havregryn', pattern: /^havregryn( |$)/, units: [{ name: 'dl', grams: 35 }] },
  {
    label: 'Gröt (kokt)',
    pattern: /^(havregrynsgrot|grot$)/,
    units: [{ name: 'dl', grams: 105 }],
  },
  {
    label: 'Müsli och granola',
    pattern: /^frukostflingor (musli|granola|flingblandning)/,
    units: [{ name: 'dl', grams: 45 }],
  },
  {
    label: 'Lätta frukostflingor (cornflakes, puffat m.m.)',
    pattern: /^frukostflingor/,
    units: [{ name: 'dl', grams: 15 }],
  },
  {
    label: 'Ris, okokt',
    pattern: /^ris .*okokt/,
    units: [{ name: 'dl', grams: 85 }],
  },
  {
    label: 'Ris, kokt',
    pattern: /^ris .*kokt/,
    units: [{ name: 'dl', grams: 70 }],
  },
  {
    label: 'Pasta, okokt (makaroner, penne o.d.)',
    pattern: /^pasta .*okokt/,
    units: [{ name: 'dl', grams: 40 }],
  },
  {
    label: 'Pasta, kokt',
    pattern: /^pasta .*kokt/,
    exclude: /(carbonara|farsk)/,
    units: [{ name: 'dl', grams: 60 }],
  },
  {
    label: 'Vetemjöl',
    pattern: /^vetemjol/,
    units: [
      { name: 'dl', grams: 60 },
      { name: 'msk', grams: 9 },
    ],
  },

  // --- Fett, socker och sött (msk/tsk) ----------------------------------
  {
    label: 'Smör och bordsmargarin',
    pattern: /^(smor (fett|extrasaltat|osaltat)|matfettsblandning|margarin)/,
    units: SPREAD,
  },
  {
    label: 'Olja',
    pattern: /^(rapsolja|olivolja|solrosolja|majsolja|matolja|sesamolja|kokosolja|linfroolja)/,
    units: OIL,
  },
  {
    label: 'Socker',
    pattern: /^socker$/,
    units: [
      { name: 'msk', grams: 13 },
      { name: 'tsk', grams: 4 },
    ],
  },
  {
    label: 'Honung',
    pattern: /^honung$/,
    units: [
      { name: 'msk', grams: 21 },
      { name: 'tsk', grams: 7 },
    ],
  },
  {
    label: 'Sylt och marmelad',
    pattern: /^(\w*sylt|\w*marmelad)(\s|$)/,
    units: JAM,
  },
  { label: 'Majonnäs', pattern: /^majonnas/, units: SPREAD },
];
