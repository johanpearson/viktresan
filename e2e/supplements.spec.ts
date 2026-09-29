import { expect, test, type Page } from '@playwright/test';
import { collectErrors, dump, isoDaysFromToday, seed } from './helpers.ts';

// Service workern skulle annars svara på livsmedel.json från sin cache, förbi page.route.
test.use({ serviceWorkers: 'block' });

const UNKNOWN_EAN = '73513537';
const FOOD_EAN = '4006381333931';

/** Påhittade testvärden i Livsmedelsverket-formatet, med D-vitamin – inte riktiga data. */
const LIVSMEDEL = {
  format: 'viktresan-livsmedel',
  source: 'Testdatabas',
  license: 'CC BY 4.0',
  retrieved: '2026-09-01',
  extra: ['vitaminD', 'iron'],
  foods: [
    [1, 'Lax ugnsbakad', 200, 22, 0, 12, '', [15, 0.3]],
    [2, 'Havregryn', 370, 13, 59, 7, '', [0, 4]],
  ],
};

const PROFILE = {
  startDate: isoDaysFromToday(-10),
  startWeightKg: 90,
  heightCm: 180,
  goalWeightKg: 80,
};

const FEATURES = {
  steg: true,
  midja: true,
  mat: true,
  vatten: true,
  traning: true,
  glp1: false,
  tillskott: true,
  bilder: true,
  version: 4,
};

interface CameraOptions {
  /** Koden som BarcodeDetector "ser" i videon (null = ingen). */
  ean: string | null;
  torch: boolean;
}

/**
 * Låtsaskamera (mörk canvas-ström) och BarcodeDetector. `torch` styr om spåret har
 * ficklampa och zoom; anropen till applyConstraints sparas i `window.__constraints`.
 * Koden kan bytas under testet via `window.__ean`.
 */
async function mockCamera(page: Page, options: CameraOptions) {
  await page.addInitScript((opts) => {
    const w = window as unknown as { __ean: string | null; __constraints: unknown[] };
    w.__ean = opts.ean;
    w.__constraints = [];
    class FakeBarcodeDetector {
      detect() {
        return Promise.resolve(w.__ean ? [{ rawValue: w.__ean, format: 'ean_13' }] : []);
      }
    }
    Object.defineProperty(window, 'BarcodeDetector', { value: FakeBarcodeDetector });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: () => {
          const canvas = document.createElement('canvas');
          canvas.width = 64;
          canvas.height = 48;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#050505';
            ctx.fillRect(0, 0, 64, 48);
          }
          const stream = canvas.captureStream(10);
          const track = stream.getVideoTracks()[0];
          if (track) {
            track.getCapabilities = () =>
              (opts.torch
                ? { torch: true, zoom: { min: 1, max: 4, step: 0.5 } }
                : {}) as unknown as MediaTrackCapabilities;
            track.applyConstraints = (c) => {
              w.__constraints.push(c);
              return Promise.resolve();
            };
          }
          return Promise.resolve(stream);
        },
      },
    });
  }, options);
}

/** Open Food Facts: bara 404 – och räknar anropen. */
async function mockOff(page: Page): Promise<string[]> {
  const requests: string[] = [];
  await page.route('https://world.openfoodfacts.org/**', (route) => {
    requests.push(route.request().url());
    return route.fulfill({
      status: 404,
      headers: { 'Access-Control-Allow-Origin': '*' },
      json: { status: 0 },
    });
  });
  return requests;
}

async function start(page: Page, hash: string, extra: Parameters<typeof seed>[1] = {}) {
  await page.route('**/livsmedel.json', (route) => route.fulfill({ json: LIVSMEDEL }));
  await page.goto('./');
  await seed(page, { profile: PROFILE, settings: { features: FEATURES }, ...extra });
  await page.goto(`./${hash}`);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

function scanner(page: Page) {
  return page.getByTestId('scanner');
}

test('skannern: lampknapp och zoom bara när kameran har dem, mörkt-tips och ficklampa', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await mockCamera(page, { ean: null, torch: true });
  await start(page, '#/logga/tillskott');
  await page.getByRole('button', { name: /^Skanna streckkod/ }).tap();
  await expect(scanner(page)).toBeVisible();
  const torch = scanner(page).getByRole('button', { name: 'Tänd lampan' });
  await expect(torch).toBeVisible();
  await expect(scanner(page).getByRole('slider')).toBeVisible();
  // Den svarta bilden mäts som mörk.
  await expect(scanner(page).getByTestId('scanner-dark')).toHaveText('Mörkt, tänd lampan?');
  await torch.tap();
  await expect(scanner(page).getByRole('button', { name: 'Släck lampan' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __constraints: unknown[] }).__constraints),
    )
    .toContainEqual({ advanced: [{ torch: true }] });
  // Stäng: kameraströmmen stoppas.
  await scanner(page).getByRole('button', { name: 'Stäng' }).tap();
  await expect(scanner(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('skannern: utan ficklampa döljs lampknappen och zoomen', async ({ page }) => {
  await mockCamera(page, { ean: null, torch: false });
  await start(page, '#/logga/tillskott');
  await page.getByRole('button', { name: /^Skanna streckkod/ }).tap();
  await expect(scanner(page).getByText('Håll streckkoden i rutan.')).toBeVisible();
  await expect(scanner(page).getByRole('button', { name: 'Tänd lampan' })).toHaveCount(0);
  await expect(scanner(page).getByRole('slider')).toHaveCount(0);
  await expect(scanner(page).getByTestId('scanner-dark')).toHaveText(
    'Mörkt – försök där det är ljusare.',
  );
});

test('manuell EAN: validering, okänd kod → tillskott via AI-import → skanna igen ger lokal träff utan nätverk', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await mockCamera(page, { ean: null, torch: false });
  const offRequests = await mockOff(page);
  await start(page, '#/logga/tillskott');
  const sheet = page.getByRole('dialog', { name: 'Tillskott' });

  await sheet.getByRole('button', { name: /^Skanna streckkod/ }).tap();
  await scanner(page).getByRole('button', { name: 'Skriv in streckkod' }).tap();
  const input = scanner(page).getByLabel('Streckkod (EAN)');
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('inputmode', 'numeric');
  await input.fill('12345678');
  await scanner(page).getByRole('button', { name: 'Slå upp' }).tap();
  await expect(scanner(page).getByRole('alert')).toContainText('Streckkoden är inte giltig');
  await input.fill(UNKNOWN_EAN);
  await scanner(page).getByRole('button', { name: 'Slå upp' }).tap();
  await expect(scanner(page)).toHaveCount(0);

  // Ingen träff lokalt eller i Open Food Facts.
  await expect(sheet.getByTestId('ean-not-found')).toContainText(`Hittade inte ${UNKNOWN_EAN}`);
  expect(offRequests).toHaveLength(1);
  await sheet
    .getByTestId('ean-not-found')
    .getByRole('button', { name: /^Lägg in med AI från etikett/ })
    .tap();

  // Prompten nämner schemat och streckkoden.
  const ai = sheet.getByTestId('ai-label');
  await expect(ai.getByTestId('ai-label-prompt')).toHaveValue(/ENDAST/);
  await expect(ai.getByTestId('ai-label-prompt')).toHaveValue(new RegExp(UNKNOWN_EAN));

  // Ogiltig JSON ger ett tydligt fel.
  const answer = ai.getByLabel('AI-tjänstens svar (JSON)');
  await answer.fill('{"namn": "D-vitamin", "enhet": ');
  await ai.getByRole('button', { name: 'Granska svaret' }).tap();
  await expect(ai.getByTestId('ai-label-error')).toContainText('inte giltig JSON');

  await answer.fill(
    '```json\n' +
      JSON.stringify({
        namn: 'D-vitamin Forte',
        enhet: 'tablett',
        mangdPerDos: 1,
        naringsamnen: [{ amne: 'vitaminD', mangd: 4000, enhet: 'IU' }],
      }) +
      '\n```',
  );
  await ai.getByRole('button', { name: 'Granska svaret' }).tap();
  const preview = ai.getByTestId('ai-label-preview');
  await expect(preview).toContainText('D-vitamin Forte');
  await expect(preview).toContainText('4 000 IE');
  await preview.getByRole('button', { name: 'Använd värdena' }).tap();

  // Formuläret är förifyllt och går att rätta innan sparning; EAN sparas.
  const form = sheet.getByTestId('supplement-form');
  await expect(form.getByLabel('Namn')).toHaveValue('D-vitamin Forte');
  await expect(form.getByLabel('Streckkod (valfri)')).toHaveValue(UNKNOWN_EAN);
  await expect(form.getByTestId('unit-conversion')).toHaveText('= 100 µg');
  // Byte till µg räknar om värdet automatiskt.
  await form.getByLabel('Enhet Vitamin D').selectOption('µg');
  await expect(form.getByLabel('Vitamin D', { exact: true })).toHaveValue('100');
  await form.getByLabel('Namn').fill('D-vitamin 100');
  await form.getByRole('button', { name: 'Spara tillskott' }).tap();
  await expect(sheet.getByTestId('supplement')).toContainText('D-vitamin 100');

  const stored = await dump(page);
  expect(stored.supplements).toEqual([
    expect.objectContaining({
      name: 'D-vitamin 100',
      ean: UNKNOWN_EAN,
      nutrients: [{ key: 'vitaminD', amount: 100, unit: 'µg' }],
      schedule: 'dagligen',
    }),
  ]);

  // Skanna igen (med kameran): lokal träff, inget nytt anrop till Open Food Facts.
  await page.evaluate((ean) => {
    (window as unknown as { __ean: string }).__ean = ean;
  }, UNKNOWN_EAN);
  await sheet.getByRole('button', { name: /^Skanna streckkod/ }).tap();
  await expect(sheet.getByTestId('supplement-form')).toBeVisible();
  await expect(sheet.getByTestId('supplement-form')).toContainText(
    'Finns redan bland dina tillskott.',
  );
  await expect(sheet.getByLabel('Namn')).toHaveValue('D-vitamin 100');
  expect(offRequests).toHaveLength(1);
  expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
});

test('korsträff: ett tillskott som skannas i Mat föreslår Tillskott', async ({ page }) => {
  await mockCamera(page, { ean: UNKNOWN_EAN, torch: false });
  const offRequests = await mockOff(page);
  await start(page, '#/mat', {
    supplements: [
      {
        id: 's1',
        name: 'Järn 20 mg',
        form: 'tablett',
        amountPerDose: 1,
        nutrients: [{ key: 'iron', amount: 20, unit: 'mg' }],
        schedule: 'dagligen',
        dosesPerDay: 1,
        ean: UNKNOWN_EAN,
        createdAt: 1,
      },
    ],
    foods: [
      {
        id: 'egen:knacke',
        name: 'Knäcke',
        source: 'egen',
        per100: { kcal: 350, proteinG: 9, carbsG: 62, fatG: 2 },
        ean: FOOD_EAN,
        createdAt: 1,
      },
    ],
  });
  await page.getByRole('button', { name: 'Skanna streckkod' }).tap();
  const elsewhere = page.getByTestId('ean-elsewhere');
  await expect(elsewhere).toContainText('Järn 20 mg');
  await expect(elsewhere).toContainText('är sparad som ett tillskott');
  await elsewhere.getByRole('link', { name: 'Öppna under Tillskott' }).tap();
  await expect(page.getByRole('dialog', { name: 'Tillskott' }).getByLabel('Namn')).toHaveValue(
    'Järn 20 mg',
  );

  // Och tvärtom: ett livsmedel som skannas under Tillskott föreslår Mat.
  await page.getByRole('button', { name: 'Avbryt' }).tap();
  await page.evaluate((ean) => {
    (window as unknown as { __ean: string }).__ean = ean;
  }, FOOD_EAN);
  await page.getByRole('button', { name: /^Skanna streckkod/ }).tap();
  await expect(page.getByTestId('ean-elsewhere')).toContainText('Knäcke');
  await page.getByRole('link', { name: 'Logga under Mat' }).tap();
  await expect(page.getByRole('heading', { name: 'Logga: Knäcke' })).toBeVisible();
  expect(offRequests).toEqual([]);
});

test('bocka av tillskott på Översikt, summering mat + tillskott och UL-varning', async ({
  page,
}) => {
  const errors = collectErrors(page);
  const today = isoDaysFromToday(0);
  await start(page, '', {
    supplements: [
      {
        id: 's-d',
        name: 'D-vitamin forte',
        form: 'tablett',
        amountPerDose: 1,
        nutrients: [{ key: 'vitaminD', amount: 4000, unit: 'IE' }],
        schedule: 'dagligen',
        dosesPerDay: 1,
        createdAt: 1,
      },
      {
        id: 's-fe',
        name: 'Järn',
        form: 'tablett',
        amountPerDose: 1,
        nutrients: [{ key: 'iron', amount: 14, unit: 'mg' }],
        schedule: 'dagligen',
        dosesPerDay: 1,
        createdAt: 1,
      },
    ],
    foodLog: [
      {
        id: 'f1',
        date: today,
        meal: 'lunch',
        foodId: 'lv:1',
        name: 'Lax ugnsbakad',
        per100: { kcal: 200, proteinG: 22, carbsG: 0, fatG: 12 },
        amount: 150,
        unit: 'g',
        grams: 150,
        createdAt: 2,
      },
      {
        id: 'f2',
        date: today,
        meal: 'lunch',
        foodId: 'off:1',
        name: 'Proteinbar',
        per100: { kcal: 380, proteinG: 30, carbsG: 30, fatG: 12 },
        amount: 50,
        unit: 'g',
        grams: 50,
        createdAt: 3,
      },
    ],
  });

  // Översikt → Att göra idag: en rad per otaget tillskott; tryck = tagen.
  const todo = page.getByTestId('todo-card');
  const rows = todo.getByTestId('todo-supplement');
  await expect(rows).toHaveCount(2);
  await rows.filter({ hasText: 'D-vitamin forte' }).getByRole('button').tap();
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Järn');

  // 4 000 IE = 100 µg + 22,5 µg från laxen > 100 µg → varning samma dag.
  const warning = page.getByTestId('ul-warning');
  await expect(warning).toContainText('Vitamin D');
  await expect(warning).toContainText('123 µg / 100 µg');
  await expect(warning).toContainText('D-vitamin forte (tillskott) 100 µg');
  await expect(warning).toContainText('Lax ugnsbakad (mat) 22,5 µg');

  // Ångra i kvittensen: raden kommer tillbaka och varningen försvinner.
  await page.getByTestId('supplement-toast').getByRole('button', { name: 'Ångra' }).tap();
  await expect(rows).toHaveCount(2);
  await expect(page.getByTestId('ul-warning')).toHaveCount(0);

  // "Alla tagna" bockar av båda med ett tryck; raderna försvinner.
  await todo.getByTestId('todo-all-taken').tap();
  await expect(rows).toHaveCount(0);
  await expect(todo.getByTestId('todo-all-taken')).toHaveCount(0);
  await expect.poll(async () => (await dump(page)).supplementLog).toHaveLength(2);

  // Näring: mat och tillskott per ämne mot RI, varningen och notisen om saknad data.
  await warning.getByRole('link', { name: 'Visa näring' }).tap();
  const nutrition = page.getByTestId('nutrition');
  await expect(nutrition).toBeVisible();
  const d = nutrition.locator('[data-key="vitaminD"]');
  await expect(d).toContainText('123 / 5 µg');
  await expect(d).toContainText('Mat 22,5 µg · Tillskott 100 µg');
  const iron = nutrition.locator('[data-key="iron"]');
  await expect(iron).toContainText('Mat 0,45 mg · Tillskott 14 mg');
  await expect(nutrition.getByTestId('ul-warning')).toContainText('Vitamin D');
  await expect(nutrition.getByTestId('nutrition-coverage')).toContainText(
    '1 av 2 livsmedel saknar vitamin- och mineraldata',
  );

  // Snitt 7 dagar: en loggad dag.
  await nutrition.getByRole('button', { name: 'Snitt 7 dagar' }).tap();
  await expect(nutrition.getByTestId('nutrition-coverage')).toContainText('1 av 7 dagar loggade');

  // Kalendern visar tillskotten.
  await page.goto('./#/kalender');
  await expect(page.getByTestId('calendar-day')).toContainText('2 av 2 tagna');
  expect(errors).toEqual([]);
});
