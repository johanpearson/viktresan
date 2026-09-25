// Hämtar Livsmedelsverkets livsmedelsdatabas och skriver public/livsmedel.json
// (namn, kcal, protein, kolhydrater, fett per 100 g). Körs manuellt:
//   npm run livsmedel
// Resultatet checkas in och precachas av service workern – appen gör aldrig
// egna anrop till Livsmedelsverket.
//
// Licens: CC BY 4.0 (https://www.livsmedelsverket.se/om-oss/psidata/) –
// källan anges i filen och i appen.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  parseFoodList,
  pickNutrients,
  serializeCompactFile,
  toCompactFile,
  type ListedFood,
} from '../src/lib/livsmedelImport.ts';

const API = process.env.LIVSMEDEL_API ?? 'https://dataportal.livsmedelsverket.se/livsmedel/api/v1';
const PAGE_SIZE = 500;
const CONCURRENCY = 6;
const RETRIES = 3;

async function getJson(url: string): Promise<unknown> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`${String(res.status)} ${res.statusText} – ${url}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function listAll(): Promise<ListedFood[]> {
  const all: ListedFood[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { items, total } = parseFoodList(
      await getJson(`${API}/livsmedel?offset=${String(offset)}&limit=${String(PAGE_SIZE)}&sprak=1`),
    );
    all.push(...items);
    process.stdout.write(
      `\rLivsmedel: ${String(all.length)}${total ? ` av ${String(total)}` : ''}`,
    );
    if (items.length < PAGE_SIZE || (total !== null && all.length >= total)) break;
  }
  process.stdout.write('\n');
  return all;
}

const foods = await listAll();
if (foods.length === 0) throw new Error('API:t returnerade inga livsmedel.');

const rows: {
  nummer: number;
  namn: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}[] = [];
let skipped = 0;
let next = 0;
async function worker() {
  while (next < foods.length) {
    const food = foods[next++];
    if (!food) break;
    const nutrients = pickNutrients(
      await getJson(`${API}/livsmedel/${String(food.nummer)}/naringsvarden?sprak=1`),
    );
    if (nutrients) rows.push({ ...food, ...nutrients });
    else skipped++;
    process.stdout.write(
      `\rNäringsvärden: ${String(rows.length + skipped)} av ${String(foods.length)}`,
    );
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
process.stdout.write('\n');

const retrieved = new Date().toISOString().slice(0, 10);
const out = fileURLToPath(new URL('../public/livsmedel.json', import.meta.url));
await writeFile(out, serializeCompactFile(toCompactFile(rows, retrieved)));
console.log(
  `Skrev ${String(rows.length)} livsmedel till public/livsmedel.json (${String(skipped)} utan energivärde).`,
);
