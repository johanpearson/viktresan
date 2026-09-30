// Hämtar Finelis öppna data (THL:s finska livsmedelsdatabas) och skriver
// public/fineli.json i samma kompakta format som public/livsmedel.json: svenska
// namn, kcal, protein, kolhydrater, fett, fiber, socker, salt, vitaminer och
// mineraler per 100 g och användningsklassen (styr enheterna, se
// src/data/fineliCategories.ts). Körs manuellt:
//   npm run fineli
// Resultatet checkas in och precachas av service workern – appen gör aldrig
// egna anrop till Fineli.
//
// Källan väljs så här (utan källa som svarar avslutas skriptet med kod 2 och
// public/fineli.json lämnas orörd):
//   FINELI_DIR=<mapp eller .zip>  ett nedladdat paket (t.ex. utan nätverk)
//   FINELI_ZIP_URL=<adress>       ett visst paket
//   annars                        första paketet på sidan med öppna data som
//                                 har svenska namn och näringsvärden
//
// Licens: CC BY 4.0 (© Institutet för hälsa och välfärd, THL,
// https://fineli.fi/fineli/sv/avoin-data) – källan anges i filen och i appen.
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import {
  FINELI_FILES,
  fineliFile,
  fineliRelease,
  fineliRows,
  parseFineliCsv,
  type FineliFileName,
} from '../src/lib/fineliImport.ts';
import { serializeCompactFile } from '../src/lib/livsmedelImport.ts';

// Sidorna med öppna data (svenska, engelska, finska) – den första som svarar används.
const PAGES = process.env.FINELI_PAGE
  ? [process.env.FINELI_PAGE]
  : ['sv', 'en', 'fi'].map((lang) => `https://fineli.fi/fineli/${lang}/avoin-data`);
// Paketen ligger som /fineli/content/file/<n>; provas i tur och ordning om sidorna inte ger länkar.
const FILE_URL = 'https://fineli.fi/fineli/content/file/';
const MAX_FILE_ID = 80;
// Fineli nekar (403) anrop utan vanliga webbläsarhuvuden.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 viktresan-data',
  Accept:
    'text/html,application/xhtml+xml,application/zip,application/octet-stream;q=0.9,*/*;q=0.8',
  'Accept-Language': 'sv,en;q=0.8',
};

/** Fineli gick inte att nå eller hade inget paket – workflowet lämnar filen orörd (exit 2). */
class FineliUnavailable extends Error {}

/** Filerna i paketet (namn utan mapp, gemener) → innehåll. */
type Package = Map<string, Uint8Array>;

function fromZip(bytes: Uint8Array): Package {
  const files: Package = new Map();
  for (const [path, data] of Object.entries(unzipSync(bytes))) {
    files.set(basename(path).toLowerCase(), data);
  }
  return files;
}

async function fromDir(dir: string): Promise<Package> {
  const files: Package = new Map();
  for (const name of await readdir(dir)) {
    const path = join(dir, name);
    if ((await stat(path)).isFile()) files.set(name.toLowerCase(), await readFile(path));
  }
  return files;
}

function isComplete(pkg: Package): boolean {
  return FINELI_FILES.every((f) => pkg.has(f.toLowerCase()));
}

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${String(res.status)} ${res.statusText} – ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Zip-filer börjar med "PK". */
function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/** Paketlänkarna på sidorna med öppna data (zip-filer och /content/file/…). Fel loggas. */
async function packageLinks(): Promise<string[]> {
  const links: string[] = [];
  for (const page of PAGES) {
    try {
      const res = await fetch(page, { headers: HEADERS });
      if (!res.ok) throw new Error(`${String(res.status)} ${res.statusText}`);
      const html = await res.text();
      links.push(
        ...[...html.matchAll(/href="([^"]+)"/g)]
          .map((m) => m[1] ?? '')
          .filter((href) => /\.zip($|\?)|\/content\/file\//i.test(href))
          .map((href) => new URL(href.replaceAll('&amp;', '&'), page).toString()),
      );
      if (links.length > 0) break;
      console.log(`Inga paketlänkar på ${page} (sidan kan vara renderad med JavaScript).`);
    } catch (err) {
      console.log(`Kunde inte läsa ${page}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return [...new Set(links)];
}

/** Första paketet bland adresserna som har alla filer, annars `null`. */
async function firstComplete(urls: Iterable<string>, quiet = false): Promise<Package | null> {
  for (const url of urls) {
    try {
      const bytes = await download(url);
      if (!isZip(bytes)) continue;
      const pkg = fromZip(bytes);
      if (isComplete(pkg)) {
        console.log(`Paket: ${url}`);
        return pkg;
      }
    } catch (err) {
      if (!quiet) {
        console.log(`Hoppar över ${url}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  return null;
}

function* fileIds(): Generator<string> {
  for (let id = 1; id <= MAX_FILE_ID; id++) yield `${FILE_URL}${String(id)}`;
}

async function loadPackage(): Promise<Package> {
  const dir = process.env.FINELI_DIR;
  if (dir) {
    const pkg = (await stat(dir)).isDirectory() ? await fromDir(dir) : fromZip(await readFile(dir));
    if (!isComplete(pkg)) throw new Error(`${dir} saknar någon av ${FINELI_FILES.join(', ')}.`);
    return pkg;
  }
  if (process.env.FINELI_ZIP_URL) {
    const pkg = await firstComplete([process.env.FINELI_ZIP_URL]);
    if (pkg) return pkg;
    throw new Error(`${process.env.FINELI_ZIP_URL} saknar någon av ${FINELI_FILES.join(', ')}.`);
  }
  const linked = await firstComplete(await packageLinks());
  if (linked) return linked;
  console.log(`Provar ${FILE_URL}1–${String(MAX_FILE_ID)} …`);
  const pkg = await firstComplete(fileIds(), true);
  if (pkg) return pkg;
  throw new FineliUnavailable(
    `Hittade inget paket med ${FINELI_FILES.join(', ')} på fineli.fi. ` +
      'Ange FINELI_ZIP_URL eller ladda ner paketet och kör med FINELI_DIR.',
  );
}

// Filerna är ISO-8859-1 (latin1).
const latin1 = new TextDecoder('latin1');
let pkg: Package;
try {
  pkg = await loadPackage();
} catch (err) {
  if (!(err instanceof FineliUnavailable)) throw err;
  console.error(err.message);
  process.exit(2);
}
const text = (name: FineliFileName | 'descript.txt') => {
  const data = pkg.get(name.toLowerCase());
  return data ? latin1.decode(data) : '';
};

const { rows, withoutName, withoutEnergy } = fineliRows({
  food: parseFineliCsv(text('food.csv')),
  names: parseFineliCsv(text('foodname_SV.csv')),
  components: parseFineliCsv(text('component.csv')),
  values: parseFineliCsv(text('component_value.csv')),
});
if (rows.length === 0) throw new Error('Paketet gav inga livsmedel.');

const release = fineliRelease(text('descript.txt'));
const retrieved = new Date().toISOString().slice(0, 10);
const out = fileURLToPath(new URL('../public/fineli.json', import.meta.url));
const file = fineliFile(rows, retrieved, release);
await writeFile(out, serializeCompactFile(file));
console.log(
  `Skrev ${String(rows.length)} livsmedel till public/fineli.json (Fineli ${release ?? 'okänd version'}; ` +
    `${String(withoutName)} utan svenskt namn, ${String(withoutEnergy)} utan energivärde).`,
);
console.log(`Övriga näringsämnen: ${file.extra?.join(', ') ?? 'inga'}.`);
