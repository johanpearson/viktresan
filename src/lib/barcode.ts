/**
 * Streckkoder: validering av EAN/GTIN och uppslag i Open Food Facts.
 * Endast streckkoden skickas till Open Food Facts – inga andra uppgifter.
 */
import type { FoodItem } from './foodSearch.ts';
import { PACKAGE_UNIT, parsePackage, parseServing, type BaseUnit, type FoodUnit } from './units.ts';

export const OFF_ORIGIN = 'https://world.openfoodfacts.org';

/** Tar bort mellanslag; `null` om det inte är en giltig EAN-8/UPC-A/EAN-13/GTIN-14. */
export function normalizeEan(input: string): string | null {
  const digits = input.replace(/\s/g, '');
  if (!/^(\d{8}|\d{12,14})$/.test(digits)) return null;
  // Kontrollsiffra (GS1): vikt 3 och 1 växelvis från höger, exklusive kontrollsiffran.
  let sum = 0;
  const body = digits.slice(0, -1);
  for (let i = 0; i < body.length; i++) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits[digits.length - 1]) ? digits : null;
}

export function offProductUrl(ean: string): string {
  const fields =
    'code,product_name,product_name_sv,brands,nutriments,nutrition_data_per,serving_size,' +
    'serving_quantity,serving_quantity_unit,quantity,product_quantity,product_quantity_unit';
  return `${OFF_ORIGIN}/api/v2/product/${ean}.json?fields=${fields}`;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Gäller näringsvärdena per 100 ml? Open Food Facts lagrar dem i `*_100g`-fälten
 * även för drycker; det är förpackningens mängd i ml (eller `nutrition_data_per`
 * = "100ml") som visar att etiketten anger per 100 ml.
 */
export function offBaseUnit(product: Record<string, unknown>): BaseUnit {
  const per = typeof product.nutrition_data_per === 'string' ? product.nutrition_data_per : '';
  if (per.replace(/\s/g, '').toLowerCase() === '100ml') return 'ml';
  if (per !== '' && per !== '100g') return 'g';
  const unit =
    typeof product.product_quantity_unit === 'string'
      ? product.product_quantity_unit.trim().toLowerCase()
      : '';
  if (unit !== '') return ['ml', 'cl', 'dl', 'l'].includes(unit) ? 'ml' : 'g';
  const text = typeof product.quantity === 'string' ? product.quantity : '';
  return /\d\s*(ml|cl|dl|l)(?![a-zåäö])/i.test(text) ? 'ml' : 'g';
}

/**
 * Tolkar svaret från Open Food Facts. `null` om produkten saknas eller saknar
 * energivärde per 100 g/ml. Makron som saknas blir 0. Gäller värdena per 100 ml
 * räknas mängden direkt i volym (`per100Unit: 'ml'`, ingen densitet). En
 * portionsstorlek blir enheten "portion" och förpackningens mängd
 * (`product_quantity`) enheten "förpackning" (t.ex. en 33 cl burk).
 */
export function parseOffProduct(ean: string, body: unknown): FoodItem | null {
  if (!isRecord(body) || body.status !== 1 || !isRecord(body.product)) return null;
  const p = body.product;
  const n = isRecord(p.nutriments) ? p.nutriments : {};
  const kj = num(n['energy-kj_100g']) ?? num(n.energy_100g);
  const kcal = num(n['energy-kcal_100g']) ?? (kj === null ? null : kj / 4.184);
  if (kcal === null) return null;
  const nameSv = typeof p.product_name_sv === 'string' ? p.product_name_sv.trim() : '';
  const name = nameSv || (typeof p.product_name === 'string' ? p.product_name.trim() : '');
  const brand = typeof p.brands === 'string' ? (p.brands.split(',')[0]?.trim() ?? '') : '';
  const label = [name || `Produkt ${ean}`, brand && !name.includes(brand) ? `(${brand})` : '']
    .filter(Boolean)
    .join(' ')
    .slice(0, 120);
  const item: FoodItem = {
    id: `off:${ean}`,
    name: label,
    source: 'openfoodfacts',
    ean,
    per100: {
      kcal: Math.round(kcal),
      proteinG: num(n.proteins_100g) ?? 0,
      carbsG: num(n.carbohydrates_100g) ?? 0,
      fatG: num(n.fat_100g) ?? 0,
    },
  };
  const base = offBaseUnit(p);
  if (base === 'ml') item.per100Unit = 'ml';
  const units: FoodUnit[] = [];
  const serving = parseServing(p.serving_size, p.serving_quantity, p.serving_quantity_unit, base);
  if (serving !== null) units.push({ name: 'portion', grams: serving, source: 'openfoodfacts' });
  const pack = parsePackage(p.product_quantity, p.product_quantity_unit, p.quantity, base);
  // En förpackning som är samma som portionen behövs inte två gånger.
  if (pack !== null && pack !== serving) {
    units.push({ name: PACKAGE_UNIT, grams: pack, source: 'openfoodfacts' });
  }
  if (units.length > 0) item.units = units;
  return item;
}

export type OffResult =
  { kind: 'found'; food: FoodItem } | { kind: 'not-found' } | { kind: 'error'; message: string };

/** Slår upp en streckkod i Open Food Facts. `fetchFn` är injicerbar för tester. */
export async function lookupOpenFoodFacts(
  ean: string,
  fetchFn: typeof fetch = fetch,
): Promise<OffResult> {
  let res: Response;
  try {
    res = await fetchFn(offProductUrl(ean), { headers: { Accept: 'application/json' } });
  } catch {
    return { kind: 'error', message: 'Kunde inte nå Open Food Facts. Är du uppkopplad?' };
  }
  if (res.status === 404) return { kind: 'not-found' };
  if (!res.ok) return { kind: 'error', message: 'Open Food Facts svarade inte som väntat.' };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { kind: 'error', message: 'Open Food Facts svarade inte som väntat.' };
  }
  const food = parseOffProduct(ean, body);
  return food ? { kind: 'found', food } : { kind: 'not-found' };
}
