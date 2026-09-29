// Hämtar Finelis öppna data (THL:s finska livsmedelsdatabas) och skriver
// public/fineli.json i samma kompakta format som public/livsmedel.json: svenska
// namn, kcal, protein, kolhydrater, fett, fiber, socker, salt, vitaminer och
// mineraler per 100 g och användningsklassen (styr enheterna, se
// src/data/fineliCategories.ts). Körs manuellt:
//   npm run fineli
// Resultatet checkas in och precachas av service workern – appen gör aldrig
// egna anrop till Fineli.
//
// Källan väljs så här:
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

const PAGE = process.env.FINELI_PAGE ?? 'https://fineli.fi/fineli/sv/avoin-data';

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
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${String(res.status)} ${res.statusText} – ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Paketlänkarna på sidan med öppna data (zip-filer och /content/file/…). */
async function packageLinks(): Promise<string[]> {
  const res = await fetch(PAGE);
  if (!res.ok) throw new Error(`${String(res.status)} ${res.statusText} – ${PAGE}`);
  const html = await res.text();
  const links = [...html.matchAll(/href="([^"]+)"/g)]
    .map((m) => m[1] ?? '')
    .filter((href) => /\.zip($|\?)|\/content\/file\//i.test(href))
    .map((href) => new URL(href.replaceAll('&amp;', '&'), PAGE).toString());
  return [...new Set(links)];
}

async function loadPackage(): Promise<Package> {
  const dir = process.env.FINELI_DIR;
  if (dir) {
    const pkg = (await stat(dir)).isDirectory() ? await fromDir(dir) : fromZip(await readFile(dir));
    if (!isComplete(pkg)) throw new Error(`${dir} saknar någon av ${FINELI_FILES.join(', ')}.`);
    return pkg;
  }
  const candidates = process.env.FINELI_ZIP_URL
    ? [process.env.FINELI_ZIP_URL]
    : await packageLinks();
  for (const url of candidates) {
    try {
      const pkg = fromZip(await download(url));
      if (isComplete(pkg)) {
        console.log(`Paket: ${url}`);
        return pkg;
      }
    } catch (err) {
      console.log(`Hoppar över ${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`Hittade inget paket med ${FINELI_FILES.join(', ')} på ${PAGE}.`);
}

// Filerna är ISO-8859-1 (latin1).
const latin1 = new TextDecoder('latin1');
const pkg = await loadPackage();
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
