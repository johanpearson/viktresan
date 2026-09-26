import { expect, test, type Page } from '@playwright/test';

const SECRET = 'Hemlig plats 59.3293N 18.0686E';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

/** Lokalt datum ± dagar som YYYY-MM-DD, samma som appens todayIso(). */
function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

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
  weightKg: number | null;
  width: number;
  height: number;
  hasExif: boolean;
  hasSecret: boolean;
}

/** Läser bilderna direkt ur IndexedDB och avkodar dem på nytt. */
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
    const rows = await new Promise<
      { blob: Blob; mimeType: string; date: string; weightKg?: number }[]
    >((resolve, reject) => {
      const req = db.transaction('photos').objectStore('photos').getAll();
      req.onsuccess = () => {
        resolve(req.result as { blob: Blob; mimeType: string; date: string; weightKg?: number }[]);
      };
      req.onerror = () => {
        reject(new Error('getAll'));
      };
    });
    db.close();
    return Promise.all(
      rows.map(async (row) => {
        const text = new TextDecoder('latin1').decode(await row.blob.arrayBuffer());
        const bitmap = await createImageBitmap(row.blob);
        return {
          type: row.blob.type,
          mimeType: row.mimeType,
          date: row.date,
          weightKg: row.weightKg ?? null,
          width: bitmap.width,
          height: bitmap.height,
          hasExif: /Exif|EXIF/.test(text),
          hasSecret: text.includes('Hemlig plats'),
        };
      }),
    );
  });
}

test('ladda upp, visa, jämföra och ta bort progressbilder', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./#/framsteg/bilder');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Framsteg');
  await expect(page.getByText('Här samlas dina progressbilder')).toBeVisible();
  await expect(page.getByTestId('photo-storage')).toHaveText('0 st · 0 B');
  await expect(page.getByTestId('storage-usage')).toContainText(/\d/);

  // Både kamera och galleri: kameran med capture, galleriet utan.
  const camera = page.getByLabel('Ta foto');
  const gallery = page.getByLabel('Välj från galleriet');
  await expect(camera).toHaveAttribute('accept', 'image/*');
  await expect(camera).toHaveAttribute('capture', 'environment');
  await expect(gallery).toHaveAttribute('accept', 'image/*');
  await expect(gallery).not.toHaveAttribute('capture');

  // Första bilden: 2400×1600 JPEG med EXIF/GPS, med vikt.
  const first = await makeJpegWithExif(page, 2400, 1600, '#0f766e');
  expect(first.toString('latin1')).toContain(SECRET);
  await page.getByLabel('Datum').fill(isoDaysFromToday(-30));
  await page.getByLabel('Vikt (kg, valfri)').fill('90,5');
  await gallery.setInputFiles({ name: 'fore.jpg', mimeType: 'image/jpeg', buffer: first });
  await expect(page.getByRole('status').filter({ hasText: 'Bilden är sparad' })).toBeVisible();
  await expect(page.getByTestId('photo')).toHaveCount(1);
  await expect(page.getByTestId('photo-storage')).toHaveText(/^1 st · \d/);
  // Bilden är daterad för 30 dagar sedan: "Första progressbilden" sparas men firas inte.
  const toast = page.getByTestId('milestone-toast');
  await expect(toast).toBeHidden();

  const [stored] = await readStoredPhotos(page);
  expect(stored).toEqual({
    type: 'image/webp',
    mimeType: 'image/webp',
    date: isoDaysFromToday(-30),
    weightKg: 90.5,
    width: 1080,
    height: 720,
    hasExif: false,
    hasSecret: false,
  });

  // Andra bilden: stående, utan vikt.
  const second = await makeJpegWithExif(page, 1500, 2000, '#b45309');
  await page.getByLabel('Datum').fill(isoDaysFromToday(0));
  await page.getByLabel('Vikt (kg, valfri)').fill('');
  await gallery.setInputFiles({ name: 'efter.jpg', mimeType: 'image/jpeg', buffer: second });
  await expect(page.getByTestId('photo')).toHaveCount(2);
  // 30 dagar efter den första: milstolpen föreslår jämförelsevyn (första mot senaste bilden).
  await expect(toast).toHaveAttribute('data-milestone', 'bild-30');
  await toast.getByRole('link', { name: 'Öppna jämförelsen' }).tap();
  await expect(toast).toBeHidden();
  await expect(page).toHaveURL(/#\/framsteg\/bilder\/jamfor$/);
  await expect(page.getByTestId('photo-compare')).toContainText('30 dagar mellan bilderna');
  await page.getByRole('button', { name: 'Avsluta jämförelse' }).tap();
  await expect(page.getByTestId('photo-compare')).toBeHidden();
  const photos = await readStoredPhotos(page);
  expect(photos.map((p) => [p.width, p.height, p.hasSecret])).toEqual(
    expect.arrayContaining([
      [1080, 720, false],
      [810, 1080, false],
    ]),
  );

  // Helskärmsvy: nyaste bilden först, bläddra till den äldre.
  await page.getByTestId('photo').first().tap();
  const viewer = page.getByRole('dialog');
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole('img')).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Nyare' })).toBeDisabled();
  await viewer.getByRole('button', { name: 'Äldre' }).tap();
  await expect(viewer).toContainText('90,5 kg');
  await viewer.getByRole('button', { name: 'Stäng' }).tap();
  await expect(viewer).toBeHidden();

  // Jämförelse: välj båda bilderna.
  await page.getByRole('button', { name: 'Jämför' }).tap();
  await page.getByTestId('photo').nth(0).tap();
  await page.getByTestId('photo').nth(1).tap();
  const compare = page.getByTestId('photo-compare');
  await expect(compare).toContainText('30 dagar mellan bilderna');
  await expect(compare.getByRole('img', { name: /^Före: .*90,5 kg$/ })).toBeVisible();
  await expect(compare.getByRole('img', { name: /^Efter: / })).toBeVisible();

  await compare.getByRole('button', { name: 'Reglage' }).tap();
  const slider = compare.getByRole('slider', { name: 'Före/efter-reglage' });
  await expect(slider).toHaveValue('50');
  await slider.fill('25');
  await expect(slider).toHaveValue('25');
  await expect(compare.locator('.compare-before')).toHaveCSS('clip-path', 'inset(0px 75% 0px 0px)');
  await compare.getByRole('button', { name: 'Avsluta jämförelse' }).tap();
  await expect(compare).toBeHidden();

  // Ta bort (med bekräftelse) från helskärmsvyn.
  await page.getByTestId('photo').first().tap();
  await viewer.getByRole('button', { name: 'Ta bort' }).tap();
  await viewer.getByRole('button', { name: 'Bekräfta borttagning' }).tap();
  await expect(page.getByTestId('photo')).toHaveCount(1);
  await viewer.getByRole('button', { name: 'Stäng' }).tap();
  await expect(page.getByTestId('photo-storage')).toHaveText(/^1 st · /);
  expect(await readStoredPhotos(page)).toHaveLength(1);

  expect(errors).toEqual([]);
});
