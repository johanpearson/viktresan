import { expect, test, type Page } from '@playwright/test';
import { collectErrors, isoDaysFromToday, seed } from './helpers.ts';

// Bakåtknappen som i en installerad app: historiken speglar hierarkin
// Översikt → flik → undervy → panel, inte klickhistoriken.

test.use({ serviceWorkers: 'block' });

const LIVSMEDEL = {
  format: 'viktresan-livsmedel',
  source: 'Testdatabas',
  license: 'CC BY 4.0',
  retrieved: '2026-09-01',
  foods: [[1, 'Havregryn', 370, 13, 59, 7]],
};

/**
 * Som en installerad PWA (display-mode: standalone). Chromiums mediaemulering via CDP har
 * inte display-mode, så matchMedia besvarar den frågan här. Appen startas i en ny flik utan
 * egen historik före sig: bakåt från Översikt lämnar appen (about:blank = appen stängs).
 */
async function launchStandalone(page: Page, path = './'): Promise<void> {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      const mode = /\(\s*display-mode\s*:\s*([a-z-]+)\s*\)/.exec(query)?.[1];
      if (!mode) return original(query);
      return original(mode === 'standalone' ? '(min-width: 0px)' : '(max-width: -1px)');
    };
  });
  await page.route('**/livsmedel.json', (route) => route.fulfill({ json: LIVSMEDEL }));
  // Tom Fineli-databas: testerna bygger på den mockade Livsmedelsverket-datan.
  await page.route('**/fineli.json', (route) =>
    route.fulfill({ json: { format: 'viktresan-livsmedel', foods: [] } }),
  );
  await page.goto(path);
  expect(await page.evaluate(() => matchMedia('(display-mode: standalone)').matches)).toBe(true);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

function heading(page: Page) {
  return page.getByRole('heading', { level: 1 });
}

function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Huvudmeny' });
}

async function historyLength(page: Page): Promise<number> {
  return page.evaluate(() => history.length);
}

test('Översikt → Mat → Kalender → bakåt landar på Översikt, och sedan lämnas appen', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await launchStandalone(page);
  await expect(heading(page)).toHaveText('Översikt');

  await nav(page).getByRole('link', { name: 'Mat' }).tap();
  await expect(heading(page)).toHaveText('Mat');
  await nav(page).getByRole('link', { name: 'Kalender' }).tap();
  await expect(heading(page)).toHaveText('Kalender');
  await nav(page).getByRole('link', { name: 'Framsteg' }).tap();
  await expect(heading(page)).toHaveText('Framsteg');

  await page.goBack();
  await expect(heading(page)).toHaveText('Översikt');
  await expect(page).toHaveURL(/\/viktresan\/#\/$/);

  // Bakåt på Översikt: historiken tar slut (appen stängs), ingen "tryck igen".
  await page.goBack();
  expect(page.url()).toBe('about:blank');
  expect(errors).toEqual([]);
});

test('Översikt i navigeringen går tillbaka i historiken i stället för att lägga till', async ({
  page,
}) => {
  await launchStandalone(page);
  await nav(page).getByRole('link', { name: 'Mat' }).tap();
  await nav(page).getByRole('link', { name: 'Kalender' }).tap();
  await expect(heading(page)).toHaveText('Kalender');
  const length = await historyLength(page);

  await nav(page).getByRole('link', { name: 'Översikt' }).tap();
  await expect(heading(page)).toHaveText('Översikt');
  expect(await historyLength(page)).toBe(length);
  await page.goBack();
  expect(page.url()).toBe('about:blank');
});

test('öppen panel: bakåt stänger panelen och stannar i vyn', async ({ page }) => {
  const errors = collectErrors(page);
  await launchStandalone(page);
  await nav(page).getByRole('link', { name: 'Logga' }).tap();
  await page.getByTestId('log-tile-vikt').tap();
  const sheet = page.getByRole('dialog', { name: 'Logga vikt' });
  await expect(sheet).toBeVisible();

  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(heading(page)).toHaveText('Logga');
  await expect(page).toHaveURL(/#\/logga$/);

  // Stängd med knappen: ingen hängande post, nästa bakåt går till Översikt.
  await page.getByTestId('log-tile-vikt').tap();
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Stäng' }).tap();
  await expect(sheet).toBeHidden();
  await page.goBack();
  await expect(heading(page)).toHaveText('Översikt');
  expect(errors).toEqual([]);
});

test('undervy: bakåt från rapporten går till urvalet', async ({ page }) => {
  await launchStandalone(page);
  await seed(page, {
    profile: {
      startDate: isoDaysFromToday(-20),
      startWeightKg: 90,
      heightCm: 180,
      goalWeightKg: 80,
    },
    weights: [
      {
        id: 'w1',
        date: isoDaysFromToday(-1),
        weightKg: 88,
        createdAt: Date.now(),
      },
    ],
  });
  await page.reload();
  await nav(page).getByRole('link', { name: 'Framsteg' }).tap();
  await page.getByRole('button', { name: 'Rapport', exact: true }).tap();
  await page.getByRole('link', { name: 'Visa rapport' }).tap();
  await expect(page.getByRole('button', { name: 'Spara som PDF' })).toBeVisible();
  await expect(page).toHaveURL(/#\/framsteg\/rapport\/visa$/);

  await page.goBack();
  await expect(page).toHaveURL(/#\/framsteg\/rapport$/);
  await expect(page.getByRole('link', { name: 'Visa rapport' })).toBeVisible();
  // Flikbyte i Framsteg lade ingen egen post: nästa bakåt är Översikt.
  await page.goBack();
  await expect(heading(page)).toHaveText('Översikt');
});

test('skannern: bakåt stänger den och släpper kameran', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __streams: MediaStream[] };
    w.__streams = [];
    class FakeBarcodeDetector {
      detect() {
        return Promise.resolve([]);
      }
    }
    Object.defineProperty(window, 'BarcodeDetector', { value: FakeBarcodeDetector });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: () => {
          const canvas = document.createElement('canvas');
          canvas.width = 64;
          canvas.height = 48;
          canvas.getContext('2d')?.fillRect(0, 0, 64, 48);
          const stream = canvas.captureStream(10);
          w.__streams.push(stream);
          return Promise.resolve(stream);
        },
      },
    });
  });
  await launchStandalone(page);
  await nav(page).getByRole('link', { name: 'Mat' }).tap();
  await page.getByRole('button', { name: 'Skanna streckkod' }).tap();
  const scanner = page.getByTestId('scanner');
  await expect(scanner.getByText('Håll streckkoden i rutan.')).toBeVisible();
  const live = () =>
    page.evaluate(() =>
      (window as unknown as { __streams: MediaStream[] }).__streams
        .flatMap((s) => s.getTracks())
        .filter((t) => t.readyState === 'live'),
    );
  expect(
    await page.evaluate(() => (window as unknown as { __streams: unknown[] }).__streams.length),
  ).toBe(1);
  expect(await live()).toHaveLength(1);

  await page.goBack();
  await expect(scanner).toHaveCount(0);
  await expect.poll(async () => (await live()).length).toBe(0);
  // Sök-panelen under skannern är kvar; nästa bakåt stänger den och stannar i Mat.
  const picker = page.getByRole('dialog', { name: 'Logga mat' });
  await expect(picker).toBeVisible();
  await page.goBack();
  await expect(picker).toBeHidden();
  await expect(heading(page)).toHaveText('Mat');
  await page.goBack();
  await expect(heading(page)).toHaveText('Översikt');
  expect(errors).toEqual([]);
});

test('genvägen Logga vikt: bakåt stänger panelen, sedan Översikt', async ({ page }) => {
  const errors = collectErrors(page);
  await launchStandalone(page, './?action=log-weight');
  const sheet = page.getByRole('dialog', { name: 'Logga vikt' });
  await expect(sheet).toBeVisible();
  // action-parametern är städad.
  await expect(page).toHaveURL(/\/viktresan\/#\/logga\/vikt$/);

  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(heading(page)).toHaveText('Logga');
  await expect(page).toHaveURL(/\/viktresan\/#\/logga$/);
  await page.goBack();
  await expect(heading(page)).toHaveText('Översikt');
  await expect(page).toHaveURL(/\/viktresan\/#\/$/);
  await page.goBack();
  expect(page.url()).toBe('about:blank');
  expect(errors).toEqual([]);
});

test('djuplänk direkt till en flik: bakåt landar på Översikt', async ({ page }) => {
  await launchStandalone(page, './#/kalender');
  await expect(heading(page)).toHaveText('Kalender');
  await page.goBack();
  await expect(heading(page)).toHaveText('Översikt');
});

test('osparade ändringar: bakåt frågar "Kasta ändringar?"', async ({ page }) => {
  const errors = collectErrors(page);
  await launchStandalone(page);
  await nav(page).getByRole('link', { name: 'Logga' }).tap();
  await page.getByTestId('log-tile-vikt').tap();
  const sheet = page.getByRole('dialog', { name: 'Logga vikt' });
  await sheet.getByLabel('Vikt (kg)').fill('88,4');

  const prompt = page.getByRole('dialog', { name: 'Kasta ändringar?' });
  await page.goBack();
  await expect(prompt).toBeVisible();
  await expect(sheet).toBeVisible();

  // Fortsätt redigera: panelen och det ifyllda finns kvar.
  await prompt.getByRole('button', { name: 'Fortsätt redigera' }).tap();
  await expect(prompt).toBeHidden();
  await expect(sheet.getByLabel('Vikt (kg)')).toHaveValue('88,4');

  // Kasta: panelen stängs, vyn är kvar och historiken har ingen hängande post.
  await page.goBack();
  await prompt.getByRole('button', { name: 'Kasta' }).tap();
  await expect(prompt).toBeHidden();
  await expect(sheet).toBeHidden();
  await expect(heading(page)).toHaveText('Logga');
  await page.goBack();
  await expect(heading(page)).toHaveText('Översikt');
  expect(errors).toEqual([]);
});

test('sparat formulär: bakåt stänger utan att fråga', async ({ page }) => {
  await launchStandalone(page);
  await nav(page).getByRole('link', { name: 'Logga' }).tap();
  await page.getByTestId('log-tile-vikt').tap();
  const sheet = page.getByRole('dialog', { name: 'Logga vikt' });
  await sheet.getByLabel('Vikt (kg)').fill('88,4');
  await sheet.getByRole('button', { name: 'Spara', exact: true }).tap();
  await expect(sheet.getByRole('status')).toBeVisible();
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Kasta ändringar?' })).toHaveCount(0);
});

test('omladdning (t.ex. ny version) lägger inte till historikposter', async ({ page }) => {
  await launchStandalone(page);
  await nav(page).getByRole('link', { name: 'Logga' }).tap();
  await page.getByTestId('log-tile-vikt').tap();
  await expect(page.getByRole('dialog', { name: 'Logga vikt' })).toBeVisible();
  const length = await historyLength(page);

  await page.reload();
  await expect(heading(page)).toHaveText('Logga');
  expect(await historyLength(page)).toBe(length);
  // Panelen (öppnad från rutnätet, utan egen adress) öppnas inte igen: dess post tas bort
  // strax efter starten, och bakåt går sedan direkt till Översikt.
  await expect
    .poll(() =>
      page.evaluate(
        () => (history.state as { viktresanNav: { depth: number } }).viktresanNav.depth,
      ),
    )
    .toBe(1);
  await page.goBack();
  await expect(heading(page)).toHaveText('Översikt');
});

test('omladdning med en panel från en adress öppnar panelen igen utan nya poster', async ({
  page,
}) => {
  await launchStandalone(page, './#/installningar/lagring');
  const sheet = page.getByRole('dialog', { name: 'Lagring' });
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/#\/installningar\/lagring$/);
  const length = await historyLength(page);

  await page.reload();
  await expect(sheet).toBeVisible();
  expect(await historyLength(page)).toBe(length);
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(heading(page)).toHaveText('Inställningar');
  await page.goBack();
  await expect(heading(page)).toHaveText('Översikt');
});
