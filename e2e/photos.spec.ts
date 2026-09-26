import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, dump, isoDaysFromToday, seed } from './helpers.ts';

const SECRET = 'Hemlig plats 59.3293N 18.0686E';

/**
 * Skapar en stor JPEG i webbläsaren och stoppar in ett EXIF-segment (APP1)
 * med GPS-IFD och en bildbeskrivning som innehåller `SECRET`.
 */
async function makeJpegWithExif(page: Page, width: number, height: number, color: string) {
  const bytes = await page.evaluate(
    async ({ width, height, color, secret }) => {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('ingen canvas');
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#fff';
      ctx.fillRect(width / 4, height / 4, width / 2, height / 2);
      const jpeg = new Uint8Array(
        await (await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 })).arrayBuffer(),
      );

      // TIFF (big endian): IFD0 med ImageDescription + GPS-pekare, GPS-IFD med latitud-ref.
      const text = new TextEncoder().encode(`${secret}\0`);
      const ifd0 = 8;
      const ifd0Size = 2 + 2 * 12 + 4;
      const gpsIfd = ifd0 + ifd0Size;
      const gpsSize = 2 + 12 + 4;
      const textOffset = gpsIfd + gpsSize;
      const tiff = new Uint8Array(textOffset + text.length);
      const v = new DataView(tiff.buffer);
      tiff.set([0x4d, 0x4d, 0x00, 0x2a], 0);
      v.setUint32(4, ifd0);
      v.setUint16(ifd0, 2);
      // 0x010E ImageDescription, ASCII
      v.setUint16(ifd0 + 2, 0x010e);
      v.setUint16(ifd0 + 4, 2);
      v.setUint32(ifd0 + 6, text.length);
      v.setUint32(ifd0 + 10, textOffset);
      // 0x8825 GPSInfo, LONG
      v.setUint16(ifd0 + 14, 0x8825);
      v.setUint16(ifd0 + 16, 4);
      v.setUint32(ifd0 + 18, 1);
      v.setUint32(ifd0 + 22, gpsIfd);
      v.setUint32(ifd0 + 26, 0);
      // GPS-IFD: 0x0001 GPSLatitudeRef = "N"
      v.setUint16(gpsIfd, 1);
      v.setUint16(gpsIfd + 2, 0x0001);
      v.setUint16(gpsIfd + 4, 2);
      v.setUint32(gpsIfd + 6, 2);
      tiff.set([0x4e, 0x00], gpsIfd + 10);
      v.setUint32(gpsIfd + 14, 0);
      tiff.set(text, textOffset);

      const header = new TextEncoder().encode('Exif\0\0');
      const length = 2 + header.length + tiff.length;
      const app1 = new Uint8Array([0xff, 0xe1, length >> 8, length & 0xff]);
      const out = new Uint8Array(jpeg.length + app1.length + header.length + tiff.length);
      out.set(jpeg.subarray(0, 2), 0);
      out.set(app1, 2);
      out.set(header, 6);
      out.set(tiff, 6 + header.length);
      out.set(jpeg.subarray(2), 6 + header.length + tiff.length);
      return Array.from(out);
    },
    { width, height, color, secret: SECRET },
  );
  return Buffer.from(bytes);
}

interface StoredPhoto {
  type: string;
  mimeType: string;
  date: string;
  sessionId: string;
  angle: string;
  side: string | null;
  width: number;
  height: number;
  hasExif: boolean;
  hasSecret: boolean;
}

type Row = Omit<StoredPhoto, 'type' | 'width' | 'height' | 'hasExif' | 'hasSecret' | 'side'> & {
  blob: Blob;
  side?: string;
  createdAt: number;
};

/** Läser bilderna direkt ur IndexedDB (i registreringsordning) och avkodar dem på nytt. */
async function readStoredPhotos(page: Page): Promise<StoredPhoto[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('viktresan');
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        reject(new Error('open'));
      };
    });
    const rows = await new Promise<Row[]>((resolve, reject) => {
      const req = db.transaction('photos').objectStore('photos').getAll();
      req.onsuccess = () => {
        resolve(req.result as Row[]);
      };
      req.onerror = () => {
        reject(new Error('getAll'));
      };
    });
    db.close();
    rows.sort((a, b) => a.createdAt - b.createdAt);
    return Promise.all(
      rows.map(async (row) => {
        const text = new TextDecoder('latin1').decode(await row.blob.arrayBuffer());
        const bitmap = await createImageBitmap(row.blob);
        return {
          type: row.blob.type,
          mimeType: row.mimeType,
          date: row.date,
          sessionId: row.sessionId,
          angle: row.angle,
          side: row.side ?? null,
          width: bitmap.width,
          height: bitmap.height,
          hasExif: /Exif|EXIF/.test(text),
          hasSecret: text.includes('Hemlig plats'),
        };
      }),
    );
  });
}

async function expectNoViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  expect(
    results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) })),
    label,
  ).toEqual([]);
}

/** getUserMedia nekas, som när användaren säger nej till kameran. */
async function denyCamera(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => Promise.reject(new DOMException('Nekad', 'NotAllowedError')),
      },
    });
  });
}

/**
 * Låtsaskamera: getUserMedia ger en canvas-ström. Färgen styrs av
 * `window.__cameraColor` så att varje bild blir olika.
 */
async function fakeCamera(page: Page) {
  await page.addInitScript(() => {
    const w = window as typeof window & { __cameraColor?: string; __cameraRequests?: string[] };
    w.__cameraColor = '#0f766e';
    w.__cameraRequests = [];
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: (constraints: MediaStreamConstraints) => {
          const video = constraints.video as { facingMode?: { ideal?: string } };
          w.__cameraRequests?.push(video.facingMode?.ideal ?? '');
          const canvas = document.createElement('canvas');
          canvas.width = 480;
          canvas.height = 640;
          const ctx = canvas.getContext('2d');
          const draw = () => {
            if (!ctx) return;
            ctx.fillStyle = w.__cameraColor ?? '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#fff';
            ctx.fillRect(160, 160, 160, 320);
          };
          draw();
          window.setInterval(draw, 100);
          return Promise.resolve(canvas.captureStream(10));
        },
      },
    });
  });
}

async function setCameraColor(page: Page, color: string) {
  await page.evaluate((c) => {
    (window as typeof window & { __cameraColor?: string }).__cameraColor = c;
  }, color);
}

/** Tar en bild i kameravyn och väntar tills den är sparad och kameran stängd. */
async function shoot(page: Page) {
  const camera = page.getByTestId('camera');
  await expect(camera).toBeVisible();
  const shutter = camera.getByRole('button', { name: 'Ta bild' });
  await expect(shutter).toBeEnabled();
  await shutter.tap();
  await expect(camera).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Bilden är sparad' })).toBeVisible();
}

test('nytt fototillfälle med båda vinklarna via filväljaren när kameran nekas', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await denyCamera(page);
  await page.goto('./#/framsteg/bilder');
  await seed(page, {
    weights: [
      { id: 'w1', date: isoDaysFromToday(-2), weightKg: 90, createdAt: 1 },
      { id: 'w2', date: isoDaysFromToday(0), weightKg: 88, createdAt: 2 },
    ],
  });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Framsteg');
  await expect(page.getByText('Här samlas dina progressbilder')).toBeVisible();
  await expect(page.getByTestId('photo-storage')).toHaveText('0 st · 0 B');

  await page.getByRole('button', { name: 'Nytt fototillfälle' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Nytt fototillfälle' });
  await expect(sheet).toBeVisible();
  // Vikten förifylls med trendvikten (EMA): 90 → 88 efter två dagar ger 89,6.
  await expect(sheet.getByLabel('Vikt (kg, valfri)')).toHaveValue('89,6');
  await expect(sheet.getByLabel('Datum')).toHaveValue(isoDaysFromToday(0));
  await sheet.getByLabel('Anteckning (valfri)').fill('Morgon, samma spegel');
  await sheet.getByRole('button', { name: 'Börja' }).tap();

  // Framifrån: kameran nekas → filväljaren (kamera med capture) och galleriet.
  await expect(sheet.getByTestId('flow-step-fram')).toBeVisible();
  await expect(sheet).toContainText('Steg 1 av 2');
  await expectNoViolations(page, 'Guiden');
  await sheet.getByRole('button', { name: 'Öppna kameran' }).tap();
  await expect(sheet.getByRole('alert')).toContainText('Appen fick inte använda kameran');
  await expect(page.getByTestId('camera')).toHaveCount(0);
  const camera = sheet.getByLabel('Ta foto');
  const gallery = sheet.getByLabel('Välj från galleriet');
  await expect(camera).toHaveAttribute('accept', 'image/*');
  await expect(camera).toHaveAttribute('capture', 'environment');
  await expect(gallery).not.toHaveAttribute('capture');

  const front = await makeJpegWithExif(page, 2400, 1600, '#0f766e');
  expect(front.toString('latin1')).toContain(SECRET);
  await camera.setInputFiles({ name: 'fram.jpg', mimeType: 'image/jpeg', buffer: front });
  await expect(sheet.getByRole('status').filter({ hasText: 'Bilden är sparad' })).toBeVisible();
  await expect(sheet.getByRole('img', { name: 'Sparad bild framifrån' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Nästa' }).tap();

  // Profil (vänster sida är förvalt): från galleriet.
  await expect(sheet.getByTestId('flow-step-profil')).toBeVisible();
  await expect(sheet).toContainText('Steg 2 av 2');
  await expect(sheet).toContainText('Vänd vänster sida mot kameran');
  const side = await makeJpegWithExif(page, 1500, 2000, '#b45309');
  await sheet
    .getByLabel('Välj från galleriet')
    .setInputFiles({ name: 'profil.jpg', mimeType: 'image/jpeg', buffer: side });
  await expect(sheet.getByRole('img', { name: 'Sparad bild profil' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Nästa' }).tap();

  await expect(sheet.getByTestId('flow-done')).toContainText('sparat med 2 nya bilder');
  await sheet.getByRole('button', { name: 'Klar' }).tap();
  await expect(sheet).toBeHidden();

  // Galleriet: en rad med datum och vikt ovanför, framifrån och profil sida vid sida.
  const row = page.getByTestId('photo-session');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('89,6 kg');
  await expect(row).toContainText('Morgon, samma spegel');
  await expect(row.getByTestId('photo')).toHaveCount(2);
  await expect(row.getByTestId('photo').nth(0)).toHaveAttribute('data-angle', 'fram');
  await expect(row.getByTestId('photo').nth(1)).toHaveAttribute('data-angle', 'profil');
  await expect(page.getByTestId('session-count')).toHaveText('1');

  // Samma komprimering och EXIF-rensning som tidigare.
  const stored = await readStoredPhotos(page);
  expect(stored).toEqual([
    {
      type: 'image/webp',
      mimeType: 'image/webp',
      date: isoDaysFromToday(0),
      sessionId: expect.any(String) as unknown as string,
      angle: 'fram',
      side: null,
      width: 1080,
      height: 720,
      hasExif: false,
      hasSecret: false,
    },
    {
      type: 'image/webp',
      mimeType: 'image/webp',
      date: isoDaysFromToday(0),
      sessionId: stored[0]?.sessionId,
      angle: 'profil',
      side: 'vanster',
      width: 810,
      height: 1080,
      hasExif: false,
      hasSecret: false,
    },
  ]);
  const { photoSessions } = await dump(page);
  expect(photoSessions).toEqual([
    {
      id: stored[0]?.sessionId,
      date: isoDaysFromToday(0),
      weightKg: 89.6,
      note: 'Morgon, samma spegel',
      createdAt: expect.any(Number) as unknown as number,
    },
  ]);

  // Filter per vinkel: bara profil.
  await page
    .getByRole('group', { name: 'Visa bilder' })
    .getByRole('button', { name: 'Profil' })
    .tap();
  await expect(page.getByTestId('photo')).toHaveCount(1);
  await expect(page.getByTestId('photo')).toHaveAttribute('data-angle', 'profil');

  // Helskärmsvyn visar vinkeln och tar bort bilden (med bekräftelse).
  await page.getByTestId('photo').tap();
  const viewer = page.getByRole('dialog', { name: /Profil \(vänster sida\)/ });
  await expect(viewer).toContainText('89,6 kg');
  await viewer.getByRole('button', { name: 'Ta bort' }).tap();
  await viewer.getByRole('button', { name: 'Bekräfta borttagning' }).tap();
  await expect(viewer).toBeHidden();
  await expect(page.getByText('Inga bilder i profil än.')).toBeVisible();
  await page
    .getByRole('group', { name: 'Visa bilder' })
    .getByRole('button', { name: 'Tillfällen' })
    .tap();
  // Tillfället har kvar framifrån och erbjuder att lägga till profil.
  await expect(row.getByTestId('photo')).toHaveCount(1);
  await expect(row.getByRole('button', { name: /^Lägg till bild profil/ })).toBeVisible();

  expect(errors).toEqual([]);
});

test('migrerade bilder: uppmaning att ange vinkel med snabbval på bilden', async ({ page }) => {
  // En databas från före fototillfällena (v8), skapad innan appen öppnar den.
  await page.goto('./manifest.webmanifest');
  await page.evaluate(
    async ({ day1, day2 }) => {
      const canvas = new OffscreenCanvas(30, 40);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('ingen canvas');
      ctx.fillStyle = '#0f766e';
      ctx.fillRect(0, 0, 30, 40);
      const blob = await canvas.convertToBlob({ type: 'image/webp' });
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('viktresan', 8);
        req.onupgradeneeded = () => {
          const d = req.result;
          const byDate = (name: string, keyPath = 'id') =>
            d.createObjectStore(name, { keyPath }).createIndex('by-date', 'date');
          byDate('weights');
          byDate('photos');
          d.createObjectStore('settings');
          d.createObjectStore('profile');
          d.createObjectStore('waist', { keyPath: 'date' });
          d.createObjectStore('steps', { keyPath: 'date' });
          d.createObjectStore('foods', { keyPath: 'id' }).createIndex('by-ean', 'ean');
          d.createObjectStore('meals', { keyPath: 'id' });
          byDate('foodLog');
          d.createObjectStore('favorites', { keyPath: 'foodId' });
          byDate('water');
          byDate('workouts');
          d.createObjectStore('workoutPlans', { keyPath: 'id' });
          d.createObjectStore('medications', { keyPath: 'id' });
          byDate('injections');
          d.createObjectStore('symptoms', { keyPath: 'date' });
          d.createObjectStore('foodUnits', { keyPath: 'foodId' });
          d.createObjectStore('milestones', { keyPath: 'id' });
          const photos = req.transaction?.objectStore('photos');
          const base = { blob, mimeType: 'image/webp', width: 30, height: 40 };
          photos?.put({ ...base, id: 'gammal1', date: day1, createdAt: 1, weightKg: 90 });
          photos?.put({ ...base, id: 'gammal2', date: day1, createdAt: 2 });
          photos?.put({ ...base, id: 'gammal3', date: day2, createdAt: 3, weightKg: 87.5 });
        };
        req.onsuccess = () => {
          resolve(req.result);
        };
        req.onerror = () => {
          reject(req.error ?? new Error('open'));
        };
      });
      db.close();
    },
    { day1: isoDaysFromToday(-40), day2: isoDaysFromToday(-10) },
  );

  // Fel samlas från appen (sidan ovan är bara en same-origin-fil att skapa databasen från).
  const errors = collectErrors(page);
  await page.goto('./#/framsteg/bilder');
  const queue = page.getByTestId('angle-queue');
  await expect(queue).toContainText('3 bilder saknar vinkel');
  await expect(queue.getByTestId('unassigned-photo')).toHaveCount(3);
  // Grupperade per datum: två tillfällen, vikten från bilderna ligger på tillfället.
  const rows = page.getByTestId('photo-session');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('87,5 kg');
  await expect(rows.nth(1)).toContainText('90,0 kg');
  await expect(rows.nth(1).getByTestId('photo')).toHaveCount(2);
  await expect(rows.nth(1)).toContainText('Vinkel saknas');
  await expectNoViolations(page, 'Ange vinkel och tillfällen');

  // Snabbval direkt på bilden.
  const day1 = queue.getByTestId('unassigned-photo').last();
  const label = (await day1.getByRole('img').getAttribute('alt')) ?? '';
  expect(label).toMatch(/90,0 kg/);
  await day1.getByRole('button', { name: /^Framifrån:/ }).tap();
  await expect(queue).toContainText('2 bilder saknar vinkel');
  await queue
    .getByTestId('unassigned-photo')
    .last()
    .getByRole('button', { name: /^Profil:/ })
    .tap();
  await expect(queue).toContainText('1 bild saknar vinkel');
  await expect(rows.nth(1).getByTestId('photo').nth(0)).toHaveAttribute('data-angle', 'fram');
  await expect(rows.nth(1).getByTestId('photo').nth(1)).toHaveAttribute('data-angle', 'profil');

  // Den sista bilden får vinkel i helskärmsvyn.
  await rows.nth(0).getByTestId('photo').tap();
  const viewer = page.getByRole('dialog', { name: /Ej angiven/ });
  await viewer.getByRole('button', { name: 'Framifrån' }).tap();
  await expect(page.getByRole('dialog', { name: /Framifrån/ })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Stäng' }).tap();
  await expect(queue).toBeHidden();

  const stored = await dump(page);
  expect(
    stored.photos.map((p) => [p.id, p.sessionId, p.angle, p.side ?? null, 'weightKg' in p]),
  ).toEqual([
    ['gammal1', `migrerad:${isoDaysFromToday(-40)}`, 'fram', null, false],
    ['gammal2', `migrerad:${isoDaysFromToday(-40)}`, 'profil', 'vanster', false],
    ['gammal3', `migrerad:${isoDaysFromToday(-10)}`, 'fram', null, false],
  ]);
  expect(stored.photoSessions).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('kameravy med spökbild och självutlösare, jämför två tillfällen per vinkel', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await fakeCamera(page);
  await page.goto('./#/framsteg/bilder');

  // Första tillfället, 30 dagar sedan, med kameran.
  await page.getByRole('button', { name: 'Nytt fototillfälle' }).tap();
  let sheet = page.getByRole('dialog', { name: 'Nytt fototillfälle' });
  await sheet.getByLabel('Datum').fill(isoDaysFromToday(-30));
  await sheet.getByLabel('Vikt (kg, valfri)').fill('90,5');
  await sheet.getByRole('button', { name: 'Börja' }).tap();
  await sheet.getByRole('button', { name: 'Öppna kameran' }).tap();
  const camera = page.getByTestId('camera');
  await expect(camera).toContainText('Ingen tidigare bild i den här vinkeln');
  await expect(camera.getByTestId('camera-ghost')).toHaveCount(0);
  await shoot(page);
  await sheet.getByRole('button', { name: 'Nästa' }).tap();
  await setCameraColor(page, '#b45309');
  await sheet.getByRole('button', { name: 'Öppna kameran' }).tap();
  await shoot(page);
  await sheet.getByRole('button', { name: 'Nästa' }).tap();
  await sheet.getByRole('button', { name: 'Klar' }).tap();
  await expect(page.getByTestId('photo-session')).toHaveCount(1);
  const first = await readStoredPhotos(page);
  expect(first.map((p) => [p.angle, p.type, p.width, p.height, p.hasExif])).toEqual([
    ['fram', 'image/webp', 480, 640, false],
    ['profil', 'image/webp', 480, 640, false],
  ]);

  // Andra tillfället, idag: spökbilden är förra bilden i samma vinkel.
  await page.getByRole('button', { name: 'Nytt fototillfälle' }).tap();
  sheet = page.getByRole('dialog', { name: 'Nytt fototillfälle' });
  await sheet.getByLabel('Vikt (kg, valfri)').fill('88');
  await sheet.getByRole('button', { name: 'Börja' }).tap();
  await setCameraColor(page, '#4338ca');
  await sheet.getByRole('button', { name: 'Öppna kameran' }).tap();
  const ghost = camera.getByTestId('camera-ghost');
  await expect(ghost).toBeVisible();
  await expect(ghost).toHaveCSS('opacity', '0.4');
  await expectNoViolations(page, 'Kameravyn');
  const opacity = camera.getByRole('slider', { name: 'Spökbildens opacitet' });
  await opacity.fill('60');
  await expect(ghost).toHaveCSS('opacity', '0.6');
  await camera.getByRole('switch', { name: /^Spökbild/ }).uncheck();
  await expect(ghost).toHaveCount(0);
  await expect(opacity).toBeDisabled();
  await camera.getByRole('switch', { name: /^Spökbild/ }).check();
  await expect(ghost).toBeVisible();
  // Främre kameran: bilden och spökbilden speglas.
  await camera.getByRole('button', { name: 'Främre kamera' }).tap();
  await expect(camera.getByRole('button', { name: 'Bakre kamera' })).toBeVisible();
  await expect(camera.locator('.camera-stage')).toHaveClass(/camera-mirrored/);
  expect(
    await page.evaluate(
      () => (window as typeof window & { __cameraRequests?: string[] }).__cameraRequests,
    ),
  ).toEqual(['environment', 'environment', 'environment', 'user']);
  // Självutlösare 3 s.
  await camera.getByRole('button', { name: '3 s' }).tap();
  await expect(camera.getByRole('button', { name: 'Ta bild' })).toBeEnabled();
  await camera.getByRole('button', { name: 'Ta bild' }).tap();
  await expect(camera.getByRole('button', { name: 'Avbryt nedräkning' })).toBeVisible();
  await expect(camera.locator('.camera-countdown')).toHaveText('3');
  await expect(camera).toBeHidden({ timeout: 10_000 });
  // 30 dagar efter första bilden: milstolpen föreslår jämförelsen.
  await expect(page.getByTestId('milestone-toast')).toHaveAttribute('data-milestone', 'bild-30');
  await sheet.getByRole('button', { name: 'Nästa' }).tap();
  await sheet.getByRole('button', { name: 'Öppna kameran' }).tap();
  // Spökbilden i profil är profilbilden från förra tillfället (inte framifrån).
  const profileGhost = await ghost.getAttribute('data-photo-id');
  await shoot(page);
  await sheet.getByRole('button', { name: 'Nästa' }).tap();
  await expect(sheet.getByTestId('flow-done')).toContainText('sparat med 2 nya bilder');
  await sheet.getByRole('button', { name: 'Klar' }).tap();
  const { photos } = await dump(page);
  const profiles = photos.filter((p) => p.angle === 'profil');
  expect(profiles).toHaveLength(2);
  expect(profiles.map((p) => p.id)).toContain(profileGhost);
  expect(profiles.find((p) => p.id === profileGhost)?.date).toBe(isoDaysFromToday(-30));

  // Jämförelse (som från milstolpen): första mot senaste, framifrån förvalt.
  await page.goto('./#/framsteg/bilder/jamfor');
  const compare = page.getByTestId('photo-compare');
  await expect(compare.getByTestId('compare-summary')).toHaveText(
    '30 dagar mellan tillfällena · −2,5 kg',
  );
  await expect(compare.getByTestId('compare-sessions')).toContainText('90,5 kg');
  await expect(compare.getByTestId('compare-sessions')).toContainText('88,0 kg');
  await expect(compare.getByTestId('compare-fram')).toBeVisible();
  await expect(compare.getByRole('img', { name: /^Före: .*90,5 kg$/ })).toBeVisible();
  await expect(compare.getByRole('img', { name: /^Efter: .*88,0 kg$/ })).toBeVisible();

  const angles = compare.getByRole('group', { name: 'Vinkel att jämföra' });
  await angles.getByRole('button', { name: 'Profil' }).tap();
  await expect(compare.getByTestId('compare-profil')).toBeVisible();
  await expect(compare.getByTestId('compare-fram')).toHaveCount(0);

  // Båda vinklarna under varandra, med dra-reglage.
  await angles.getByRole('button', { name: 'Båda vinklarna' }).tap();
  await expect(compare.getByRole('heading', { name: 'Framifrån' })).toBeVisible();
  await expect(compare.getByRole('heading', { name: 'Profil' })).toBeVisible();
  await compare.getByRole('button', { name: 'Reglage' }).tap();
  const slider = compare.getByRole('slider', { name: 'Före/efter-reglage profil' });
  await expect(slider).toHaveValue('50');
  await slider.fill('25');
  await expect(compare.getByTestId('compare-profil').locator('.compare-before')).toHaveCSS(
    'clip-path',
    'inset(0px 75% 0px 0px)',
  );
  await expect(compare.getByRole('slider', { name: 'Före/efter-reglage framifrån' })).toHaveValue(
    '50',
  );
  await expectNoViolations(page, 'Jämförelse');

  // Samma tillfälle två gånger → uppmaning; snabbvalet återställer första mot senaste.
  await compare.getByLabel('Från tillfälle').selectOption({ index: 1 });
  await expect(compare).toContainText('Välj två olika tillfällen');
  await compare.getByRole('button', { name: 'Första mot senaste' }).tap();
  await expect(compare.getByTestId('compare-summary')).toContainText('30 dagar');

  await compare.getByRole('button', { name: 'Avsluta jämförelse' }).tap();
  await expect(compare).toBeHidden();
  // Galleriets knapp öppnar jämförelsen igen.
  await page.getByRole('button', { name: 'Jämför' }).tap();
  await expect(page.getByTestId('photo-compare')).toBeVisible();

  expect(errors).toEqual([]);
});
