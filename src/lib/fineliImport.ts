/**
 * Omvandlar Finelis öppna data (THL:s finska livsmedelsdatabas, fineli.fi) till
 * samma kompakta format som Livsmedelsverkets data (`public/fineli.json`, se
 * livsmedelFormat.ts). Används av `scripts/fetch-fineli.ts`; rena funktioner så
 * att de kan testas.
 *
 * Paketet är semikolonseparerade CSV-filer (ISO-8859-1, decimalkomma):
 * - `food.csv`: FOODID;FOODNAME;FOODTYPE;PROCESS;EDPORT;IGCLASS;IGCLASSP;FUCLASS;FUCLASSP
 * - `foodname_SV.csv`: FOODID;FOODNAME;LANG – de svenska namnen
 * - `component.csv`: EUFDNAME;COMPUNIT;… – näringsämnenas enheter (KJ, G, MG, UG)
 * - `component_value.csv`: FOODID;EUFDNAME;BESTLOC;… – värden per 100 g ätlig del
 * - `descript.txt`: beskrivning med version ("Release. 20.0")
 *
 * Livsmedelsgruppen i den kompakta filen är Finelis användningsklass (FUCLASS,
 * t.ex. `FRUFRESH`), som `src/data/fineliCategories.ts` gör om till appens
 * kategorier.
 *
 * Licens: CC BY 4.0 (© Institutet för hälsa och välfärd, THL). Källan anges i
 * filen och i appen.
 */
import type { ExtraNutrients, NutrientKey } from '../data/nutrients.ts';
import type { LivsmedelFile } from './livsmedelFormat.ts';
import { toCompactFile, type CompactRow } from './livsmedelImport.ts';

export const FINELI_SOURCE = 'Fineli, Institutet för hälsa och välfärd (THL)';
export const FINELI_LICENSE = 'CC BY 4.0';

/** Filerna i paketet som behövs. */
export const FINELI_FILES = [
  'food.csv',
  'foodname_SV.csv',
  'component.csv',
  'component_value.csv',
] as const;

export type FineliFileName = (typeof FINELI_FILES)[number];

/**
 * Tolkar en semikolonseparerad fil med rubrikrad till objekt per rad. Klarar
 * CRLF och citattecken ("a;b"). Tomma rader hoppas över.
 */
export function parseFineliCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = splitLine(lines[0] ?? '').map((h) => h.trim().toUpperCase());
  const rows: Record<string, string>[] = [];
  for (const line of lines.slice(1)) {
    if (line.trim() === '') continue;
    const cells = splitLine(line);
    const row: Record<string, string> = {};
    for (const [i, key] of header.entries()) row[key] = (cells[i] ?? '').trim();
    rows.push(row);
  }
  return rows;
}

function splitLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c ?? '';
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === ';') {
      cells.push(cell);
      cell = '';
    } else cell += c ?? '';
  }
  cells.push(cell);
  return cells;
}

/** "1698,30" → 1698.3. Tomt eller ogiltigt → `null`. */
export function fineliNumber(text: string | undefined): number | null {
  if (text === undefined) return null;
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Versionen ur `descript.txt` ("Versio. Version. Release. 20.0"), annars `null`. */
export function fineliRelease(descript: string): string | null {
  return /Release\.?\s*(\d+(?:\.\d+)?)/i.exec(descript)?.[1] ?? null;
}

const KJ_PER_KCAL = 4.184;

/** Finelis näringsämnen (EUFDNAME) för appens övriga näringsämnen, i tur och ordning. */
export const FINELI_EXTRA_CODES: Readonly<Record<NutrientKey, readonly string[]>> = {
  fiberG: ['FIBC', 'FIBT'],
  sugarG: ['SUGAR'],
  saltG: ['NACL'],
  vitaminA: ['VITA'],
  vitaminD: ['VITD'],
  vitaminE: ['VITE'],
  vitaminK: ['VITK'],
  thiamin: ['THIA'],
  riboflavin: ['RIBF'],
  niacin: ['NIA'],
  vitaminB6: ['VITPYRID', 'VITB6'],
  folate: ['FOL'],
  vitaminB12: ['VITB12'],
  vitaminC: ['VITC'],
  calcium: ['CA'],
  iron: ['FE'],
  magnesium: ['MG'],
  potassium: ['K'],
  phosphorus: ['P'],
  zinc: ['ZN'],
  selenium: ['SE'],
  iodine: ['ID'],
};

/** Appens enhet per näringsämne (samma som `NUTRIENTS`). */
const APP_UNIT: Readonly<Record<NutrientKey, 'g' | 'mg' | 'µg'>> = {
  fiberG: 'g',
  sugarG: 'g',
  saltG: 'g',
  vitaminA: 'µg',
  vitaminD: 'µg',
  vitaminE: 'mg',
  vitaminK: 'µg',
  thiamin: 'mg',
  riboflavin: 'mg',
  niacin: 'mg',
  vitaminB6: 'mg',
  folate: 'µg',
  vitaminB12: 'µg',
  vitaminC: 'mg',
  calcium: 'mg',
  iron: 'mg',
  magnesium: 'mg',
  potassium: 'mg',
  phosphorus: 'mg',
  zinc: 'mg',
  selenium: 'µg',
  iodine: 'µg',
};

/** Faktor till gram för enheterna i `component.csv`. */
const UNIT_GRAMS: Readonly<Record<string, number>> = {
  G: 1,
  MG: 1e-3,
  UG: 1e-6,
  µg: 1e-6,
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Tre värdesiffror räcker – håller filen liten (samma som Livsmedelsverkets). */
function roundSignificant(n: number): number {
  if (n === 0) return 0;
  return Number(n.toPrecision(3));
}

export interface FineliTables {
  food: readonly Record<string, string>[];
  names: readonly Record<string, string>[];
  components: readonly Record<string, string>[];
  values: readonly Record<string, string>[];
}

/** Arkiverade livsmedel (utgångna produkter) har prefixet "(ARC)" i namnet (version 20). */
const ARCHIVED = /^\(ARC\)/i;

/**
 * Namnet som det skrivs i appen. Version 20 har namnen i versaler ("BANAN, SKALAD");
 * de skrivs då med gemener och stor första bokstav ("Banan, skalad"), som i version 18.
 */
export function fineliName(raw: string): string {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name === '' || /\p{Ll}/u.test(name)) return name;
  const lower = name.toLocaleLowerCase('sv');
  return lower.charAt(0).toLocaleUpperCase('sv') + lower.slice(1);
}

export interface FineliRowsResult {
  rows: CompactRow[];
  /** Livsmedel utan svenskt namn (hoppas över). */
  withoutName: number;
  /** Livsmedel utan energivärde (hoppas över). */
  withoutEnergy: number;
  /** Arkiverade livsmedel, "(ARC)" (hoppas över). */
  archived: number;
}

/**
 * Livsmedlen med svenska namn, energi (kcal) och makron per 100 g, övriga
 * näringsämnen i appens enheter och användningsklassen som grupp.
 */
export function fineliRows(tables: FineliTables): FineliRowsResult {
  const svNames = new Map<string, string>();
  for (const row of tables.names) {
    const id = row.FOODID ?? '';
    const name = (row.FOODNAME ?? '').trim();
    if (id !== '' && name !== '' && (row.LANG === undefined || row.LANG.toUpperCase() === 'SV')) {
      svNames.set(id, name);
    }
  }
  const units = new Map<string, string>();
  for (const row of tables.components) {
    if (row.EUFDNAME) units.set(row.EUFDNAME, (row.COMPUNIT ?? '').toUpperCase());
  }
  const values = new Map<string, Map<string, number>>();
  for (const row of tables.values) {
    const id = row.FOODID ?? '';
    const code = row.EUFDNAME ?? '';
    const value = fineliNumber(row.BESTLOC);
    if (id === '' || code === '' || value === null || value < 0) continue;
    let perFood = values.get(id);
    if (!perFood) {
      perFood = new Map();
      values.set(id, perFood);
    }
    perFood.set(code, value);
  }

  const rows: CompactRow[] = [];
  let withoutName = 0;
  let withoutEnergy = 0;
  let archived = 0;
  for (const food of tables.food) {
    const id = food.FOODID ?? '';
    const nummer = Number(id);
    if (!Number.isInteger(nummer) || nummer <= 0) continue;
    const raw = svNames.get(id);
    if (raw === undefined) {
      withoutName++;
      continue;
    }
    if (ARCHIVED.test(raw) || ARCHIVED.test(food.FOODNAME ?? '')) {
      archived++;
      continue;
    }
    const namn = fineliName(raw);
    const v = values.get(id) ?? new Map<string, number>();
    const energy = v.get('ENERC');
    if (energy === undefined) {
      withoutEnergy++;
      continue;
    }
    const kcalFactor = (units.get('ENERC') ?? 'KJ') === 'KCAL' ? 1 : 1 / KJ_PER_KCAL;
    const row: CompactRow = {
      nummer,
      namn,
      kcal: Math.round(energy * kcalFactor),
      proteinG: round1(v.get('PROT') ?? 0),
      carbsG: round1(v.get('CHOAVL') ?? v.get('CHOCDF') ?? 0),
      fatG: round1(v.get('FAT') ?? 0),
    };
    const group = (food.FUCLASS ?? '').trim();
    if (group !== '') row.grupp = group;
    const extra: ExtraNutrients = {};
    for (const [key, codes] of Object.entries(FINELI_EXTRA_CODES) as [
      NutrientKey,
      readonly string[],
    ][]) {
      const code = codes.find((c) => v.has(c));
      if (code === undefined) continue;
      const value = v.get(code) ?? 0;
      const from = UNIT_GRAMS[units.get(code) ?? ''];
      const to = UNIT_GRAMS[APP_UNIT[key] === 'µg' ? 'UG' : APP_UNIT[key].toUpperCase()] ?? 1;
      // Okänd enhet: anta att värdet redan är i appens enhet.
      extra[key] = roundSignificant(from === undefined ? value : (value * from) / to);
    }
    if (Object.keys(extra).length > 0) row.extra = extra;
    rows.push(row);
  }
  return { rows, withoutName, withoutEnergy, archived };
}

/** Hela filen `public/fineli.json`. */
export function fineliFile(
  rows: readonly CompactRow[],
  retrieved: string,
  release: string | null,
): LivsmedelFile {
  const file = toCompactFile(rows, retrieved, {
    source: FINELI_SOURCE,
    license: FINELI_LICENSE,
  });
  if (release !== null) file.version = release;
  return file;
}
