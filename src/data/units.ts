/**
 * Standardenheter, kategori och densitet för vanliga livsmedel i Livsmedelsverkets databas.
 *
 * VÄRDENA ÄR UNGEFÄRLIGA. De är sammanställda för Viktresan utifrån svenska
 * hushållsmått (1 dl = 100 ml, 1 msk = 15 ml, 1 tsk = 5 ml) omräknade med
 * typisk densitet, samt medelstorlekar och skivtjocklekar som de brukar anges i
 * receptsamlingar, på förpackningar och i Livsmedelsverkets portionsuppgifter.
 * De är inte hämtade ur en officiell tabell och varierar mellan sorter, märken
 * och hur man mäter (t.ex. hur hårt ett dl-mått packas). Ätlig del utan skal
 * och kärnor avses för frukt och grönsaker; ägg avses utan skal.
 *
 * Volymenheter (dl, msk …) räknas fram ur densiteten – livsmedlets egen här,
 * annars kategorins (`src/data/foodCategories.ts`). Tabellen innehåller därför
 * bara styckenheter (st, skiva …) och densiteter som avviker från kategorin.
 *
 * Matchning (se `foodProfile` i `src/lib/units.ts`):
 * - `ids`: Livsmedelsverkets livsmedelsnummer (`lv:<nummer>`), matchar direkt.
 * - `pattern`: reguljärt uttryck mot det normaliserade namnet – gemener,
 *   å/ä → a, ö → o, skiljetecken → mellanslag (`normalize` i foodSearch.ts).
 *   "Ägg kokt" matchas alltså som "agg kokt".
 * - `exclude`: namn som matchar detta hoppas över (t.ex. friterat, torkat).
 * Första regeln som matchar gäller. Mer specifika regler står därför först.
 */

import type { FoodCategory } from './foodCategories.ts';

export interface StandardUnitRule {
  /** Vad regeln gäller, för läsaren av tabellen. */
  label: string;
  ids?: readonly number[];
  pattern?: RegExp;
  exclude?: RegExp;
  /** Kategori, om namnmönstren i foodCategories.ts inte räcker eller blir fel. */
  category?: FoodCategory;
  /** Gram per ml, om livsmedlet avviker från kategorins densitet. */
  density?: number;
  /** Styckenheter med ungefärlig vikt. */
  units?: readonly { name: string; grams: number }[];
}

/** Tillagat, torkat, konserverat m.m. – då stämmer inte styckvikten för råvaran. */
const PROCESSED =
  /(friterad|stekt|torkad|torkat|konserv|juice|saft|sylt|mos|soppa|sallad|chips|pure|stuvad|gratang|pulver|dryck|smoothie|paj|kaka|glass)/;

export const STANDARD_UNIT_RULES: readonly StandardUnitRule[] = [
  // --- Ägg ---------------------------------------------------------------
  {
    label: 'Ägg (kokt, rått, stekt), medelstort utan skal',
    pattern: /^agg (kokt|ratt|stekt)/,
    category: 'agg',
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
    category: 'gronsak',
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
    category: 'potatis',
    units: [{ name: 'st', grams: 90 }],
  },

  // --- Bröd -------------------------------------------------------------
  {
    label: 'Knäckebröd och annat hårt bröd',
    pattern: /^(hart brod|knacke)/,
    category: 'brod',
    units: [{ name: 'skiva', grams: 12 }],
  },
  {
    label: 'Mjukt bröd (limpa, formfranska m.m.)',
    pattern: /^brod /,
    exclude: /(tortilla|croissant|giffel|scones|chapati|pitabrod|baguette|krutong)/,
    category: 'brod',
    units: [{ name: 'skiva', grams: 35 }],
  },

  // --- Ost och pålägg ---------------------------------------------------
  {
    label: 'Hårdost, hyvlad skiva',
    pattern: /^ost hardost/,
    exclude: /parmesan/,
    category: 'ost',
    units: [{ name: 'skiva', grams: 10 }],
  },
  {
    label: 'Skivat pålägg (skinka, kalkon, salami, leverpastej)',
    pattern: /^(gris skinka (skivad|rokt|lufttorkad)|kalkon rokt|palaggskorv|leverpastej skivbar)/,
    category: 'palagg',
    units: [{ name: 'skiva', grams: 10 }],
  },
  {
    label: 'Köttbullar',
    pattern: /^kottbullar/,
    units: [{ name: 'st', grams: 15 }],
  },

  // --- Mejeri och drycker -----------------------------------------------
  {
    label: 'Mjölk och växtdryck (1 dl ≈ 103 g)',
    pattern: /^(mjolk fett|mellanmjolk|lattmjolk|havredryck)/,
    category: 'mjolk',
    density: 1.03,
  },
  {
    label: 'Kvarg (1 dl ≈ 110 g)',
    pattern: /^kvarg (farskost|naturell|smaksatt)/,
    category: 'fil',
    density: 1.1,
  },

  // --- Gryn, flingor, ris och pasta -------------------------------------
  { label: 'Havregryn (1 dl ≈ 35 g)', pattern: /^havregryn( |$)/, density: 0.35 },
  {
    label: 'Müsli och granola (1 dl ≈ 45 g)',
    pattern: /^frukostflingor (musli|granola|flingblandning)/,
    category: 'gryn',
    density: 0.45,
  },
  {
    label: 'Lätta frukostflingor, cornflakes, puffat m.m. (1 dl ≈ 15 g)',
    pattern: /^frukostflingor/,
    category: 'gryn',
    density: 0.15,
  },
  { label: 'Ris, okokt (1 dl ≈ 85 g)', pattern: /^ris .*okokt/, density: 0.85 },
  { label: 'Ris, kokt (1 dl ≈ 70 g)', pattern: /^ris .*kokt/, density: 0.7 },
  {
    label: 'Pasta, okokt – makaroner, penne o.d. (1 dl ≈ 40 g)',
    pattern: /^pasta .*okokt/,
    density: 0.4,
  },
  {
    label: 'Pasta, kokt (1 dl ≈ 60 g)',
    pattern: /^pasta .*kokt/,
    exclude: /(carbonara|farsk)/,
    category: 'kokt',
    density: 0.6,
  },

  // --- Fett, socker och sött --------------------------------------------
  { label: 'Honung (1 msk ≈ 21 g)', pattern: /^honung$/, density: 1.4 },
  { label: 'Majonnäs (1 msk ≈ 14 g)', pattern: /^majonnas/, category: 'sas', density: 0.93 },
  { label: 'Salt (1 tsk ≈ 6 g)', pattern: /^salt( |$)/, category: 'kryddor', density: 1.2 },
];
