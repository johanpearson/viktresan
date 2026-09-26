/**
 * Omvandlar svar från Livsmedelsverkets API (dataportal.livsmedelsverket.se,
 * livsmedel/api/v1) till den kompakta filen `public/livsmedel.json`.
 * Används av `scripts/fetch-livsmedel.ts`; rena funktioner så att de kan testas.
 *
 * Licens: CC BY 4.0. Källan ska anges som "Livsmedelsverkets livsmedelsdatabas"
 * med version/datum – det görs i filen och i appen.
 */
import { LIVSMEDEL_FORMAT, type CompactFood, type LivsmedelFile } from './livsmedelFormat.ts';

export const LIVSMEDEL_SOURCE = 'Livsmedelsverkets livsmedelsdatabas';
export const LIVSMEDEL_LICENSE = 'CC BY 4.0';

export interface ListedFood {
  nummer: number;
  namn: string;
  /** Livsmedelsgrupp, om listan har den. */
  grupp?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Tal som kan komma som "12,5" eller 12.5. */
function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Livsmedelslistan: `{ _meta: { totalRecords }, livsmedel: [...] }` (eller bara en lista). */
export function parseFoodList(body: unknown): { items: ListedFood[]; total: number | null } {
  const list: unknown = Array.isArray(body) ? body : isRecord(body) ? body.livsmedel : null;
  const items: ListedFood[] = [];
  if (Array.isArray(list)) {
    for (const row of list) {
      if (!isRecord(row)) continue;
      const nummer = toNumber(row.nummer);
      const namn = typeof row.namn === 'string' ? row.namn.trim() : '';
      if (nummer === null || !Number.isInteger(nummer) || namn === '') continue;
      const item: ListedFood = { nummer, namn };
      const grupp = groupField(row);
      if (grupp !== null) item.grupp = grupp;
      items.push(item);
    }
  }
  const meta = isRecord(body) && isRecord(body._meta) ? body._meta : null;
  const total = meta ? toNumber(meta.totalRecords) : null;
  return { items, total };
}

/** Text ur ett fält som är en sträng eller ett objekt med `namn`/`beskrivning`. */
function text(v: unknown): string | null {
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  if (isRecord(v)) return text(v.namn) ?? text(v.beskrivning) ?? text(v.varde);
  return null;
}

/** Ett fält vars namn innehåller "grupp" (t.ex. `livsmedelsgrupp`, `huvudgrupp`). */
function groupField(row: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(row)) {
    if (!/grupp/i.test(key)) continue;
    const t = text(value);
    if (t !== null) return t;
  }
  return null;
}

/**
 * Livsmedelsgruppen ur ett livsmedels klassificeringar
 * (`/livsmedel/{nummer}/klassificeringar`) eller ur livsmedlet självt. Svaret
 * tolkas förlåtande: en post vars typ/namn nämner "grupp" (livsmedelsgrupp,
 * huvudgrupp) ger sitt namn eller sin beskrivning. `null` om ingen grupp finns.
 */
export function pickGroup(body: unknown): string | null {
  if (isRecord(body)) {
    const direct = groupField(body);
    if (direct !== null) return direct;
  }
  const list: unknown = Array.isArray(body)
    ? body
    : isRecord(body)
      ? (body.klassificeringar ?? body.klassificering)
      : null;
  if (!Array.isArray(list)) return null;
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const direct = groupField(entry);
    if (direct !== null) return direct;
    const kind = [entry.typ, entry.klassificeringstyp, entry.klassificering, entry.kategori]
      .map(text)
      .find((t) => t !== null);
    if (kind && /grupp/i.test(kind)) {
      const name = text(entry.namn) ?? text(entry.beskrivning) ?? text(entry.varde);
      if (name !== null && name !== kind) return name;
    }
  }
  return null;
}

interface Rule {
  code: string;
  unit?: string;
  names: readonly string[];
}

const RULES = {
  kcal: { code: 'ENERC', unit: 'kcal', names: ['energi (kcal)'] },
  proteinG: { code: 'PROT', names: ['protein'] },
  carbsG: { code: 'CHO', names: ['kolhydrater, tillgängliga', 'kolhydrater'] },
  fatG: { code: 'FAT', names: ['fett, totalt', 'fett'] },
} satisfies Record<string, Rule>;

function find(values: readonly Record<string, unknown>[], rule: Rule): number | null {
  const unitOk = (v: Record<string, unknown>) =>
    rule.unit === undefined ||
    (typeof v.enhet === 'string' && v.enhet.trim().toLowerCase() === rule.unit);
  const byCode = values.find(
    (v) => typeof v.euroFIRkod === 'string' && v.euroFIRkod.trim() === rule.code && unitOk(v),
  );
  if (byCode) return toNumber(byCode.varde);
  for (const name of rule.names) {
    const byName = values.find(
      (v) => typeof v.namn === 'string' && v.namn.trim().toLowerCase() === name && unitOk(v),
    );
    if (byName) return toNumber(byName.varde);
  }
  return null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Energi och makron per 100 g ur ett livsmedels näringsvärden. `null` om
 * energin saknas; saknade makron blir 0.
 */
export function pickNutrients(
  body: unknown,
): { kcal: number; proteinG: number; carbsG: number; fatG: number } | null {
  const list: unknown = Array.isArray(body) ? body : isRecord(body) ? body.naringsvarden : null;
  if (!Array.isArray(list)) return null;
  const values = list.filter(isRecord);
  const kcal = find(values, RULES.kcal);
  if (kcal === null || kcal < 0) return null;
  const macro = (rule: Rule) => Math.max(0, find(values, rule) ?? 0);
  return {
    kcal: Math.round(kcal),
    proteinG: round1(macro(RULES.proteinG)),
    carbsG: round1(macro(RULES.carbsG)),
    fatG: round1(macro(RULES.fatG)),
  };
}

export function toCompactFile(
  rows: readonly {
    nummer: number;
    namn: string;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    grupp?: string;
  }[],
  retrieved: string,
): LivsmedelFile {
  const foods: CompactFood[] = [...rows]
    .sort((a, b) => a.namn.localeCompare(b.namn, 'sv'))
    .map((r): CompactFood => {
      const row: CompactFood = [r.nummer, r.namn, r.kcal, r.proteinG, r.carbsG, r.fatG];
      return r.grupp ? [...row, r.grupp] : row;
    });
  return {
    format: LIVSMEDEL_FORMAT,
    source: LIVSMEDEL_SOURCE,
    license: LIVSMEDEL_LICENSE,
    retrieved,
    foods,
  };
}

/** En rad per livsmedel – kompakt men läsbar i diffar. */
export function serializeCompactFile(file: LivsmedelFile): string {
  const head = JSON.stringify({ ...file, foods: [] }).replace(/"foods":\[\]\}$/, '"foods":[');
  const rows = file.foods.map((f) => JSON.stringify(f)).join(',\n');
  return `${head}\n${rows}\n]}\n`;
}
