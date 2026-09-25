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
  foods: [
    [1, 'Havregryn', 370, 13, 59, 7],
    [2, 'Mjölk fett 3 %', 60, 3.5, 4.8, 3],
    [3, 'Banan', 95, 1.1, 21, 0.3],
    [4, 'Potatis kokt', 80, 2, 17, 0.1],
  ],
};

const EAN = '4006381333931';
const UNKNOWN_EAN = '73513537';

/** Man född 1986, 180 cm, måttligt aktiv, 0,5 kg/vecka, ingen vikt loggad (trend = 90 kg). */
const PROFILE = {
  startDate: isoDaysFromToday(-10),
  startWeightKg: 90,
  heightCm: 180,
  goalWeightKg: 80,
  sex: 'man',
  birthYear: 1986,
  activityLevel: 'mattlig',
  ratePerWeekKg: 0.5,
};

/** Samma beräkning som appen: Mifflin-St Jeor × 1,55 − 0,5 × 7 700 / 7. */
function expectedTarget(): number {
  const age = new Date().getFullYear() - PROFILE.birthYear;
  const bmr = 10 * 90 + 6.25 * 180 - 5 * age + 5;
  return Math.round(bmr * 1.55 - 550);
}

function kcalText(value: number): string {
  return new Intl.NumberFormat('sv-SE').format(value).replace(/\s/g, ' ');
}

async function openFood(page: Page, profile: Record<string, unknown> = PROFILE) {
  await page.route('**/livsmedel.json', (route) => route.fulfill({ json: LIVSMEDEL }));
  await page.goto('./');
  await seed(page, { profile });
  await page.goto('./#/mat');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mat');
  await expect(page.getByTestId('livsmedel-source')).toContainText('Testdatabas');
}

async function searchAndPick(page: Page, query: string, name: string, label = 'Sök livsmedel') {
  await page.getByLabel(label).fill(query);
  await page.getByTestId('search-result').filter({ hasText: name }).first().tap();
}

async function logAmount(page: Page, amount: string, meal?: string) {
  const form = page.getByTestId('food-log-form');
  await expect(form).toBeVisible();
  await form.getByLabel(/Mängd \(g\)|Antal portioner/).fill(amount);
  if (meal) await form.getByLabel('Måltid').selectOption({ label: meal });
  await form.getByRole('button', { name: 'Logga', exact: true }).tap();
  await expect(form).toBeHidden();
}

test('sök och logga livsmedel, redigera, ta bort och se summeringen', async ({ page }) => {
  const errors = collectErrors(page);
  await openFood(page);
  const target = expectedTarget();
  const intake = page.getByTestId('intake');
  await expect(intake).toHaveText(`0 / ${kcalText(target)} kcal`);

  // Fuzzy: stavfel och ö utan prickar.
  await searchAndPick(page, 'havregrin', 'Havregryn');
  await expect(page.getByTestId('log-preview')).toContainText('100 g ger 370 kcal');
  await logAmount(page, '60', 'Frukost');
  await expect(page.getByRole('status').filter({ hasText: 'Loggade' })).toHaveText(
    'Loggade Havregryn (60 g) till frukost.',
  );
  await expect(intake).toHaveText(`222 / ${kcalText(target)} kcal`);

  await searchAndPick(page, 'mjolk', 'Mjölk fett 3 %');
  await logAmount(page, '200', 'Frukost');
  await expect(intake).toContainText('342');
  await expect(page.getByTestId('remaining-kcal')).toHaveText(
    `${kcalText(target - 342)} kcal kvar`,
  );
  await expect(page.getByRole('progressbar', { name: 'Intag av kalorimålet' })).toHaveAttribute(
    'aria-valuenow',
    String(Math.round((342 / target) * 100)),
  );
  // Makron: protein 7,8 + 7 g, kolhydrater 35,4 + 9,6 g, fett 4,2 + 6 g.
  const macros = page.getByTestId('macros');
  await expect(macros).toContainText('Protein15 g');
  await expect(macros).toContainText('Kolhydrater45 g');
  await expect(macros).toContainText('Fett10 g');

  const breakfast = page.getByTestId('meal-frukost');
  await expect(breakfast.getByTestId('food-entry')).toHaveCount(2);
  await expect(breakfast.getByRole('heading')).toContainText('342 kcal');

  // Redigera mjölken till 300 g.
  await page.getByRole('button', { name: 'Redigera Mjölk fett 3 %' }).tap();
  await expect(page.getByRole('heading', { name: 'Redigera: Mjölk fett 3 %' })).toBeVisible();
  await expect(page.getByLabel('Mängd (g)')).toHaveValue('200');
  await page.getByLabel('Mängd (g)').fill('300');
  await page.getByRole('button', { name: 'Spara ändringar' }).tap();
  await expect(intake).toContainText('402');

  // Ta bort havregrynen.
  await page.getByRole('button', { name: 'Ta bort Havregryn' }).tap();
  await page.getByRole('button', { name: 'Bekräfta borttagning av Havregryn' }).tap();
  await expect(intake).toContainText('180');
  await expect(breakfast.getByTestId('food-entry')).toHaveCount(1);

  // Favorit + mellanmål.
  await searchAndPick(page, 'banan', 'Banan');
  const star = page.getByRole('button', { name: 'Favorit' });
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await star.tap();
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await logAmount(page, '120', 'Mellanmål');
  await expect(page.getByTestId('meal-mellanmal')).toContainText('Banan');
  await expect(intake).toContainText('294');

  // Snabbval: senaste (nyast först) och favoriter.
  const quick = page.getByTestId('quick-pick');
  await expect(quick.first()).toContainText('Banan');
  await expect(quick).toHaveCount(2);
  await page.getByRole('button', { name: 'Favoriter', exact: true }).tap();
  await expect(quick).toHaveCount(1);
  await quick.first().tap();
  await logAmount(page, '100');
  await expect(intake).toContainText('389');

  const stored = await dump(page);
  expect(stored.foodLog).toHaveLength(3);
  expect(stored.foodLog).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        foodId: 'lv:2',
        grams: 300,
        meal: 'frukost',
        date: isoDaysFromToday(0),
        per100: { kcal: 60, proteinG: 3.5, carbsG: 4.8, fatG: 3 },
      }),
    ]),
  );
  expect(stored.favorites).toEqual([expect.objectContaining({ foodId: 'lv:3' })]);
  expect(errors).toEqual([]);
});

test('skapa eget livsmedel och måltid och logga dem', async ({ page }) => {
  const errors = collectErrors(page);
  await openFood(page);
  await page.getByRole('button', { name: 'Egna', exact: true }).tap();

  // Eget livsmedel med portion.
  await page.getByRole('button', { name: 'Nytt livsmedel' }).tap();
  await page.getByLabel('Namn').fill('Mormors bulle');
  await page.getByLabel('Energi (kcal)').fill('380');
  await page.getByLabel('Protein (g)').fill('7');
  await page.getByLabel('Kolhydrater (g)').fill('50');
  await page.getByLabel('Fett (g)').fill('16');
  await page.getByLabel('Portion (valfri)').fill('bulle');
  await page.getByLabel('Portionens vikt (g)').fill('60');
  await page.getByRole('button', { name: 'Spara livsmedel' }).tap();
  await expect(page.getByTestId('own-food')).toHaveCount(1);
  await expect(page.getByTestId('own-food')).toContainText('380 kcal/100 g');

  // Måltid med två ingredienser.
  await page.getByRole('button', { name: 'Ny måltid' }).tap();
  await page.getByLabel('Måltidens namn').fill('Frukostgröt');
  await searchAndPick(page, 'havregryn', 'Havregryn', 'Lägg till ingrediens');
  await page.getByLabel('Gram Havregryn').fill('60');
  await searchAndPick(page, 'mjölk', 'Mjölk fett 3 %', 'Lägg till ingrediens');
  await page.getByLabel('Gram Mjölk fett 3 %').fill('200');
  await expect(page.getByTestId('ingredient')).toHaveCount(2);
  await expect(page.getByTestId('meal-total')).toHaveText('Totalt 260 g · 342 kcal');
  await page.getByRole('button', { name: 'Spara måltid' }).tap();
  await expect(page.getByTestId('own-meal')).toHaveCount(1);
  await expect(page.getByTestId('own-meal')).toContainText('342 kcal');
  await expect(page.getByTestId('own-meal')).toContainText('Havregryn 60 g, Mjölk fett 3 % 200 g');

  // Logga måltiden via snabbvalet Måltider – en portion är hela måltiden.
  await page.getByRole('button', { name: 'Dag', exact: true }).tap();
  await page.getByRole('button', { name: 'Måltider', exact: true }).tap();
  await page.getByTestId('quick-pick').filter({ hasText: 'Frukostgröt' }).tap();
  await expect(page.getByRole('button', { name: 'Portioner' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByLabel('Antal portioner')).toHaveValue('1');
  await logAmount(page, '1', 'Frukost');
  await expect(page.getByTestId('intake')).toContainText('342');
  await expect(page.getByTestId('meal-frukost')).toContainText('1 portion (260 g)');

  // Det egna livsmedlet i portioner, sedan omräknat till gram.
  await searchAndPick(page, 'bulle', 'Mormors bulle');
  await expect(page.getByLabel('Antal portioner')).toHaveValue('1');
  await page.getByLabel('Antal portioner').fill('2');
  await page.getByRole('button', { name: 'Gram', exact: true }).tap();
  await expect(page.getByLabel('Mängd (g)')).toHaveValue('120');
  await page.getByRole('button', { name: 'Portioner' }).tap();
  await logAmount(page, '1,5', 'Mellanmål');
  // 342 + 90 g × 3,8 = 342 + 342.
  await expect(page.getByTestId('intake')).toContainText('684');
  await expect(page.getByTestId('meal-mellanmal')).toContainText('1,5 bulle (90 g)');

  const stored = await dump(page);
  expect(stored.meals).toEqual([
    expect.objectContaining({
      name: 'Frukostgröt',
      items: [
        expect.objectContaining({ foodId: 'lv:1', grams: 60 }),
        expect.objectContaining({ foodId: 'lv:2', grams: 200 }),
      ],
    }),
  ]);
  expect(stored.foods).toEqual([
    expect.objectContaining({ name: 'Mormors bulle', source: 'egen', portionG: 60 }),
  ]);
  expect(errors).toEqual([]);
});

test('skanna streckkod: slå upp i Open Food Facts, cacha och skapa okänd produkt', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // Låtsaskamera och BarcodeDetector som hittar EAN direkt.
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
  const offRequests: string[] = [];
  await page.route('https://world.openfoodfacts.org/**', (route) => {
    offRequests.push(route.request().url());
    const found = route.request().url().includes(`/product/${EAN}.json`);
    return route.fulfill({
      status: found ? 200 : 404,
      headers: { 'Access-Control-Allow-Origin': '*' },
      json: found
        ? {
            status: 1,
            product: {
              product_name: 'Testmüsli',
              brands: 'Testbolaget',
              serving_quantity: 45,
              nutriments: {
                'energy-kcal_100g': 400,
                proteins_100g: 10,
                carbohydrates_100g: 60,
                fat_100g: 12,
              },
            },
          }
        : { status: 0 },
    });
  });
  await openFood(page);

  await page.getByRole('button', { name: 'Skanna streckkod' }).tap();
  await page.getByRole('button', { name: 'Starta kameran' }).tap();
  await expect(page.getByRole('heading', { name: 'Logga: Testmüsli (Testbolaget)' })).toBeVisible();
  await expect(page.getByTestId('food-log-form')).toContainText('Open Food Facts');
  await expect(page.getByLabel('Antal portioner')).toHaveValue('1');
  await logAmount(page, '1', 'Frukost');
  // 45 g × 4 kcal/g.
  await expect(page.getByTestId('intake')).toContainText('180');
  expect(offRequests).toHaveLength(1);
  expect(offRequests[0]).toContain(`/api/v2/product/${EAN}.json`);

  // Träffen är cachad lokalt: nästa skanning frågar inte Open Food Facts.
  let stored = await dump(page);
  expect(stored.foods).toEqual([
    expect.objectContaining({ id: `off:${EAN}`, ean: EAN, source: 'openfoodfacts', portionG: 45 }),
  ]);
  await page.getByRole('button', { name: 'Skanna streckkod' }).tap();
  await page.getByRole('button', { name: 'Starta kameran' }).tap();
  await expect(page.getByTestId('food-log-form')).toBeVisible();
  expect(offRequests).toHaveLength(1);
  await page.getByRole('button', { name: 'Avbryt' }).tap();

  // Okänd streckkod via manuell inmatning → skapa eget livsmedel med koden ifylld.
  await page.getByRole('button', { name: 'Skanna streckkod' }).tap();
  await page.getByLabel('Streckkod (EAN)').fill('1234');
  await page.getByRole('button', { name: 'Slå upp' }).tap();
  await expect(page.getByRole('alert')).toContainText('Streckkoden är inte giltig');
  await page.getByLabel('Streckkod (EAN)').fill(UNKNOWN_EAN);
  await page.getByRole('button', { name: 'Slå upp' }).tap();
  await expect(page.getByTestId('ean-not-found')).toContainText(UNKNOWN_EAN);
  await page.getByRole('button', { name: 'Skapa eget livsmedel' }).tap();
  await expect(page.getByLabel('Streckkod (valfri)')).toHaveValue(UNKNOWN_EAN);
  await page.getByLabel('Namn').fill('Lokal knäcke');
  await page.getByLabel('Energi (kcal)').fill('350');
  await page.getByRole('button', { name: 'Spara livsmedel' }).tap();
  await logAmount(page, '20', 'Lunch');
  await expect(page.getByTestId('intake')).toContainText('250');

  stored = await dump(page);
  expect(stored.foods).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'Lokal knäcke', ean: UNKNOWN_EAN, source: 'egen' }),
    ]),
  );
  expect(offRequests).toHaveLength(2);
  expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
});

test('utan BarcodeDetector går det att skriva in streckkoden', async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'BarcodeDetector');
  });
  await openFood(page);
  await page.getByRole('button', { name: 'Skanna streckkod' }).tap();
  await expect(page.getByTestId('scanner-unsupported')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Starta kameran' })).toHaveCount(0);
  await expect(page.getByLabel('Streckkod (EAN)')).toBeVisible();
});

test('historik och översikt: intag mot mål, 7-dagarssnitt och förklarade spärrar', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // 70 kg, 1 kg/vecka och 10 kg på 6 veckor: både takt- och måldatumsspärr.
  const profile = {
    ...PROFILE,
    startWeightKg: 70,
    goalWeightKg: 60,
    ratePerWeekKg: 1,
    goalDate: isoDaysFromToday(42),
  };
  const per100 = { kcal: 100, proteinG: 5, carbsG: 12, fatG: 3 };
  const foodLog = [0, 1, 2, 4].map((daysAgo, i) => ({
    id: `f${String(i)}`,
    date: isoDaysFromToday(-daysAgo),
    meal: 'lunch',
    foodId: 'lv:4',
    name: 'Potatis kokt',
    grams: 1800 + i * 100,
    per100,
    createdAt: Date.now() - daysAgo * 86_400_000,
  }));
  await page.route('**/livsmedel.json', (route) => route.fulfill({ json: LIVSMEDEL }));
  await page.goto('./');
  await seed(page, { profile, foodLog });

  // Översikt: kalorimål, takt, prognos och sakliga förklaringar.
  await page.goto('./');
  const age = new Date().getFullYear() - 1986;
  const tdee = (10 * 70 + 6.25 * 180 - 5 * age + 5) * 1.55;
  const target = Math.round(tdee - (0.7 * 7700) / 7);
  await expect(page.getByTestId('calorie-target')).toHaveText(`${kcalText(target)} kcal`);
  await expect(page.getByTestId('plan-rate')).toHaveText('0,7 kg/vecka');
  await expect(page.getByTestId('plan-forecast')).toContainText('ca ');
  const notes = page.getByTestId('plan-notes');
  await expect(notes).toContainText('Vald takt (1 kg/vecka) är snabbare än 1 % av din trendvikt');
  await expect(notes).toContainText('Underskottet höjs inte');
  await expect(notes).toContainText('Tidigaste rimliga datum är omkring');
  await page.getByText('Så räknas målet ut').tap();
  await expect(page.getByTestId('plan-source')).toContainText('formel');

  // Mat → Historik.
  await page.goto('./#/mat');
  await page.getByRole('button', { name: 'Historik', exact: true }).tap();
  const chart = page.getByRole('img', { name: 'Stapelgraf med intag per dag mot kalorimålet' });
  await expect(chart.locator('canvas')).toBeVisible();
  await expect(chart).toHaveAttribute('data-bars', '4');
  await expect(chart.locator('.u-legend')).toContainText('7-dagarssnitt');
  await expect(chart.locator('.u-legend')).toContainText('Mål');
  // (1 800 + 1 900 + 2 000 + 2 100) / 4 = 1 950.
  await expect(page.getByTestId('intake-average')).toContainText(
    '7-dagarssnitt: 1 950 kcal per loggad dag (4 av 7 dagar loggade).',
  );
  const rows = page.getByTestId('intake-table').locator('tbody tr');
  await expect(rows).toHaveCount(7);
  await expect(rows.nth(0)).toContainText('1 800 kcal');
  await expect(rows.nth(3)).toContainText('–');
  expect(errors).toEqual([]);
});

test('profilen: nya fält för kalorimålet', async ({ page }) => {
  await page.goto('./#/installningar');
  await page.getByLabel('Startdatum').fill(isoDaysFromToday(-7));
  await page.getByLabel('Startvikt (kg)').fill('90');
  await page.getByLabel('Längd (cm)').fill('180');
  await page.getByLabel('Målvikt (kg)').fill('80');
  await page.getByLabel('Kön').selectOption('man');
  await page.getByLabel('Födelseår').fill('1986');
  await page.getByLabel(/Måttligt aktiv/).check();
  await expect(page.getByLabel('Önskad takt')).toHaveValue('0.5');
  await page.getByLabel('Önskad takt').selectOption({ label: '0,75 kg per vecka' });
  await page.getByRole('button', { name: 'Spara profil' }).tap();
  await expect(page.getByText('Profilen är sparad.')).toBeVisible();

  const stored = await dump(page);
  expect(stored.profile).toMatchObject({
    sex: 'man',
    birthYear: 1986,
    activityLevel: 'mattlig',
    ratePerWeekKg: 0.75,
  });
  await page.goto('./');
  await expect(page.getByTestId('plan-rate')).toHaveText('0,75 kg/vecka');
});
