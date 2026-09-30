import { expect, test, type Page } from '@playwright/test';
import { collectErrors, dump, isoDaysFromToday, seed } from './helpers.ts';

// Service workern skulle annars svara på livsmedel.json från sin cache, förbi page.route.
test.use({ serviceWorkers: 'block' });

/** Påhittade testvärden i Livsmedelsverket-formatet – inte riktiga data. */
const LIVSMEDEL = {
  format: 'viktresan-livsmedel',
  source: 'Testdatabas',
  license: 'CC BY 4.0',
  retrieved: '2026-09-01',
  extra: ['fiberG', 'sugarG'],
  foods: [
    // 11 g protein × 4 = 44 av 65 kcal → proteinrik (och ≤ 40 kcal? nej).
    [1, 'Kvarg naturell', 65, 11, 4, 0.2, '', [0, 4]],
    // 5 × 4 = 20 av 250 kcal = 8 % → inte proteinrik.
    [2, 'Kvargkaka', 250, 5, 30, 12, '', [0.5, 20]],
    // 34 kcal, 2,6 g fiber: fiberrik och energisnål.
    [3, 'Broccoli kokt', 34, 2.8, 4, 0.4, '', [2.6, 1.5]],
  ],
};

const EAN = '4006381333931';

async function openFood(page: Page) {
  await page.route('**/livsmedel.json', (route) => route.fulfill({ json: LIVSMEDEL }));
  // Tom Fineli-databas: testerna bygger på den mockade Livsmedelsverket-datan.
  await page.route('**/fineli.json', (route) =>
    route.fulfill({ json: { format: 'viktresan-livsmedel', foods: [] } }),
  );
  await page.goto('./');
  await seed(page, {
    profile: {
      startDate: isoDaysFromToday(-10),
      startWeightKg: 90,
      heightCm: 180,
      goalWeightKg: 80,
    },
  });
  await page.goto('./#/mat');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mat');
}

/** Låtsaskamera och BarcodeDetector som hittar EAN direkt. */
async function fakeScanner(page: Page) {
  await page.addInitScript((ean) => {
    class FakeBarcodeDetector {
      detect() {
        return Promise.resolve([{ rawValue: ean, format: 'ean_13' }]);
      }
    }
    Object.defineProperty(window, 'BarcodeDetector', { value: FakeBarcodeDetector });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: () => {
          const canvas = document.createElement('canvas');
          canvas.width = 64;
          canvas.height = 64;
          canvas.getContext('2d')?.fillRect(0, 0, 64, 64);
          return Promise.resolve(canvas.captureStream());
        },
      },
    });
  }, EAN);
}

test('skannad vara utan fiber: komplettera, uppdatera tidigare logg, skanna igen', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await fakeScanner(page);
  const offRequests: string[] = [];
  await page.route('https://world.openfoodfacts.org/**', (route) => {
    offRequests.push(route.request().url());
    return route.fulfill({
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      json: {
        status: 1,
        product: {
          product_name: 'Testflingor',
          brands: 'Testbolaget',
          // Fiber och socker saknas i Open Food Facts.
          nutriments: {
            'energy-kcal_100g': 380,
            proteins_100g: 12,
            carbohydrates_100g: 60,
            fat_100g: 8,
          },
        },
      },
    });
  });
  await openFood(page);

  // Första skanningen: status visar vad som saknas.
  await page.getByRole('button', { name: 'Skanna streckkod' }).tap();
  const form = page.getByTestId('food-log-form');
  await expect(
    page.getByRole('heading', { name: 'Logga: Testflingor (Testbolaget)' }),
  ).toBeVisible();
  const status = form.getByTestId('nutrition-status');
  await expect(status.getByTestId('nutrition-incomplete')).toHaveText('Ofullständig näringsdata');
  await expect(status).toContainText('Saknas: fiber, socker');
  await expect(status.getByTestId('nutrition-fiberG-value')).toHaveText('saknas');
  await expect(status.getByTestId('nutrition-kcal')).toContainText('Open Food Facts');
  await expect(form.getByTestId('fiber-rich')).toHaveCount(0);
  // Logga en gång med de ursprungliga värdena.
  await form
    .getByRole('group', { name: 'Enhet' })
    .getByRole('button', { name: 'g', exact: true })
    .tap();
  await page.getByLabel('Mängd (g)').fill('50');
  await form.getByRole('button', { name: 'Logga', exact: true }).tap();
  await expect(page.getByRole('status').filter({ hasText: 'Loggade Testflingor' })).toBeVisible();

  // Andra skanningen (lokalt, ingen ny fråga till OFF): komplettera manuellt.
  await page.getByRole('dialog').getByRole('button', { name: 'Skanna streckkod' }).tap();
  await expect(form).toBeVisible();
  expect(offRequests).toHaveLength(1);
  await form.getByTestId('nutrition-complete').tap();
  const complete = page.getByTestId('nutrition-complete-form');
  await expect(complete.getByTestId('complete-kcal')).toHaveValue('380');
  await expect(complete.getByTestId('complete-kcal-origin')).toHaveText('Från Open Food Facts');
  await expect(complete.getByTestId('complete-fiberG')).toHaveValue('');
  await expect(complete.getByTestId('complete-fiberG-origin')).toHaveText('Saknas');
  await expect(complete.getByTestId('nutrition-ai')).toContainText('Fota etiketten med AI');
  await complete.getByTestId('complete-fiberG').fill('12');
  await complete.getByTestId('complete-sugarG').fill('4');
  // Befintligt värde går att rätta.
  await complete.getByTestId('complete-kcal').fill('390');
  await complete.getByRole('button', { name: 'Spara värden' }).tap();

  // Erbjudande att uppdatera den tidigare loggposten.
  const offer = page.getByTestId('log-update-offer');
  await expect(offer).toBeVisible();
  await expect(offer.getByTestId('update-scope-idag')).toHaveText('Bara idag (1)');
  await offer.getByTestId('update-scope-alla').tap();
  await offer.getByTestId('update-log').tap();
  await expect(offer).toHaveCount(0);
  await expect(page.getByTestId('nutrition-notice')).toHaveText('Uppdaterade 1 loggpost.');
  await expect(status.getByTestId('nutrition-incomplete')).toHaveCount(0);
  await expect(status.getByTestId('nutrition-fiberG-value')).toHaveText('12 g');
  await expect(status.getByTestId('nutrition-fiberG-value')).toHaveAttribute('data-origin', 'egen');
  await expect(status.getByTestId('nutrition-fiberG')).toContainText('Eget värde');
  await expect(form.getByTestId('fiber-rich')).toHaveText('Fiberrik');

  let stored = await dump(page);
  expect(stored.foodOverrides).toEqual([
    expect.objectContaining({
      foodId: `off:${EAN}`,
      ean: EAN,
      values: { kcal: 390, fiberG: 12, sugarG: 4 },
    }),
  ]);
  expect(stored.foodLog).toEqual([
    expect.objectContaining({
      foodId: `off:${EAN}`,
      grams: 50,
      per100: { kcal: 390, proteinG: 12, carbsG: 60, fatG: 8 },
    }),
  ]);
  // Källans cachade värden är orörda.
  expect(stored.foods).toEqual([
    expect.objectContaining({ id: `off:${EAN}`, per100: expect.objectContaining({ kcal: 380 }) }),
  ]);
  await form.getByRole('button', { name: 'Avbryt' }).tap();

  // Tredje skanningen: de egna värdena går före, med Fiberrik.
  await page.getByRole('dialog').getByRole('button', { name: 'Skanna streckkod' }).tap();
  await expect(form).toBeVisible();
  expect(offRequests).toHaveLength(1);
  await expect(form.getByTestId('fiber-rich')).toHaveText('Fiberrik');
  await expect(status.getByTestId('nutrition-incomplete')).toHaveCount(0);
  await status.getByText('Näringsvärden per 100 g').tap();
  await expect(status.getByTestId('nutrition-fiberG-value')).toHaveText('12 g');
  await expect(status.getByTestId('nutrition-fiberG-value')).toHaveAttribute('data-origin', 'egen');
  await expect(status.getByTestId('nutrition-kcal-value')).toHaveText('390 kcal');
  await expect(status.getByTestId('nutrition-proteinG-value')).toHaveAttribute(
    'data-origin',
    'kalla',
  );
  await expect(form.getByTestId('food-per-100')).toContainText('390 kcal');

  stored = await dump(page);
  expect(stored.foodOverrides).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('filtrera sökningen på Proteinrik och dölj en etikett i inställningarna', async ({ page }) => {
  const errors = collectErrors(page);
  await openFood(page);
  await page.getByRole('button', { name: 'Sök och logga mat' }).tap();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Sök livsmedel').fill('kvarg');
  const results = sheet.getByTestId('search-result');
  await expect(results).toHaveCount(2);
  await expect(
    results.filter({ hasText: 'Kvarg naturell' }).getByTestId('protein-rich'),
  ).toHaveText('Proteinrik');
  await expect(results.filter({ hasText: 'Kvargkaka' }).getByTestId('protein-rich')).toHaveCount(0);

  const chip = sheet.getByTestId('claim-filter-proteinrik');
  await chip.tap();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(results).toHaveCount(1);
  await expect(results).toContainText('Kvarg naturell');
  await chip.tap();
  await expect(results).toHaveCount(2);

  // Broccoli: tre etiketter; filtret Energisnål + Fiberrik hittar den.
  await sheet.getByLabel('Sök livsmedel').fill('broccoli');
  const broccoli = results.filter({ hasText: 'Broccoli kokt' });
  await expect(broccoli.getByTestId('protein-rich')).toBeVisible();
  await expect(broccoli.getByTestId('fiber-rich')).toBeVisible();
  await expect(broccoli.getByTestId('low-energy')).toHaveText('Energisnål');
  await sheet.getByTestId('claim-filter-fiberrik').tap();
  await sheet.getByTestId('claim-filter-energisnal').tap();
  await expect(results).toHaveCount(1);
  await sheet.getByLabel('Sök livsmedel').fill('kvarg');
  await expect(results).toHaveCount(0);
  await expect(sheet).toContainText('Inga träffar med de valda etiketterna.');

  // Inställningar → Visning: dölj Proteinrik.
  await page.goto('./#/installningar/visning');
  const toggle = page.getByTestId('pref-claim-proteinrik');
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await page.goto('./#/mat/logga');
  await page.getByRole('dialog').getByLabel('Sök livsmedel').fill('kvarg');
  await expect(page.getByTestId('search-result')).toHaveCount(2);
  await expect(page.getByTestId('protein-rich')).toHaveCount(0);
  await expect(page.getByTestId('claim-filter-proteinrik')).toHaveCount(0);
  expect(errors).toEqual([]);
});
