// Renderar app-ikonerna (PNG) från SVG-källorna med Playwrights Chromium.
// Körs manuellt vid ändrad ikon: `npm run icons`. Resultatet checkas in i public/.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('..', import.meta.url));
const standard = await readFile(`${root}public/favicon.svg`, 'utf8');
const maskable = await readFile(`${root}scripts/icon-maskable.svg`, 'utf8');

const targets = [
  { file: 'pwa-192x192.png', size: 192, svg: standard },
  { file: 'pwa-512x512.png', size: 512, svg: standard },
  { file: 'maskable-512x512.png', size: 512, svg: maskable },
  { file: 'apple-touch-icon.png', size: 180, svg: maskable },
];

const executablePath = process.env.PW_CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  for (const { file, size, svg } of targets) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    await page.setContent(
      `<html><body style="margin:0"><img src="${dataUrl}" width="${size}" height="${size}" style="display:block"></body></html>`,
    );
    await page.locator('img').evaluate((img) => img.decode());
    await writeFile(`${root}public/${file}`, await page.screenshot({ omitBackground: true }));
    await page.close();
    console.log(`public/${file}`);
  }
} finally {
  await browser.close();
}
