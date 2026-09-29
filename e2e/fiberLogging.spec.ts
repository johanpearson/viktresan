import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectErrors, isoDaysFromToday, seed } from './helpers.ts';

// Service workern skulle annars svara på livsmedel.json från sin cache, förbi page.route.
test.use({ serviceWorkers: 'block' });

/** Påhittade testvärden: havregryn med fiber (10 g/100 g), mjölk utan fiberdata. */
const LIVSMEDEL = {
  format: 'viktresan-livsmedel',
  source: 'Testdatabas',
  license: 'CC BY 4.0',
  retrieved: '2026-09-01',
  extra: ['fiberG'],
  foods: [
    [1, 'Havregryn', 370, 13, 59, 7, '', [10]],
    [2, 'Mjölk fett 3 %', 60, 3.5, 4.8, 3],
  ],
};

/** Fibermålet är av (ingen GLP-1, inget "Visa fibermål") – fibern visas ändå vid makrona. */
const PROFILE = {
  startDate: isoDaysFromToday(-10),
  startWeightKg: 90,
  heightCm: 180,
  goalWeightKg: 80,
  sex: 'man',
  birthYear: 1986,
  activityLevel: 'mattlig',
};

function sheet(page: Page): Locator {
  return page.getByRole('dialog');
}

async function search(page: Page, query: string, name: string): Promise<Locator> {
  await sheet(page).getByLabel('Sök livsmedel').fill(query);
  return sheet(page).getByTestId('search-result').filter({ hasText: name }).first();
}

async function logGrams(page: Page, grams: string) {
  const form = page.getByTestId('food-log-form');
  const chip = form.getByRole('group', { name: 'Enhet' }).getByRole('button', {
    name: 'g',
    exact: true,
  });
  await chip.tap();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await form.getByLabel(/^Mängd/).fill(grams);
  await form.getByLabel('Måltid').selectOption({ label: 'Frukost' });
}

test('fiber visas i sheeten, på raden och i summorna – "–" och markering när data saknas', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.route('**/livsmedel.json', (route) => route.fulfill({ json: LIVSMEDEL }));
  await page.goto('./');
  await seed(page, { profile: PROFILE });
  await page.goto('./#/mat');
  await page.getByRole('button', { name: 'Sök och logga mat' }).tap();

  // Sökträffen: makron och fiber per 100 g, fibern i fiberns färg.
  const oats = await search(page, 'havregryn', 'Havregryn');
  await expect(oats.getByTestId('pick-macros')).toHaveText('P 13 g · K 59 g · F 7 g · Fi 10 g');
  await expect(oats.getByTestId('fiber')).toHaveClass(/macro-fiber/);
  await oats.tap();

  // Detaljer: per 100 g och per enhet (1 dl ≈ 35 g).
  const form = page.getByTestId('food-log-form');
  await expect(form.getByTestId('food-per-100').getByTestId('fiber')).toHaveText('Fi 10 g');
  await expect(form.getByTestId('food-per-unit')).toContainText('Per dl');
  await expect(form.getByTestId('food-per-unit').getByTestId('fiber')).toHaveText('Fi 3,5 g');

  // Näringsraden räknas om live för vald mängd och enhet.
  const macros = form.getByTestId('log-macros');
  await expect(page.getByTestId('log-preview')).toHaveText('1 dl ≈ 35 g · 130 kcal');
  await expect(macros).toHaveText('P 4,6 g · K 21 g · F 2,4 g · Fi 3,5 g');
  await form.getByLabel(/^Mängd/).fill('2');
  await expect(macros.getByTestId('fiber')).toHaveText('Fi 7 g');
  await logGrams(page, '60');
  await expect(macros).toHaveText('P 7,8 g · K 35 g · F 4,2 g · Fi 6 g');
  await form.getByRole('button', { name: 'Logga', exact: true }).tap();
  await expect(form).toBeHidden();

  // Mjölk saknar fiberdata: "–", inte 0.
  const milk = await search(page, 'mjolk', 'Mjölk');
  await expect(milk.getByTestId('fiber')).toHaveText('Fi – (fiberdata saknas)');
  await milk.tap();
  await logGrams(page, '200');
  await expect(macros.getByTestId('fiber')).toContainText('Fi –');
  await form.getByRole('button', { name: 'Logga', exact: true }).tap();
  await expect(form).toBeHidden();

  // Senaste: samma makrorad.
  await sheet(page).getByLabel('Sök livsmedel').fill('');
  await sheet(page).getByRole('button', { name: 'Senaste' }).tap();
  await expect(
    sheet(page).getByTestId('quick-pick').filter({ hasText: 'Havregryn' }).getByTestId('fiber'),
  ).toHaveText('Fi 10 g');
  await sheet(page).getByRole('button', { name: 'Stäng', exact: true }).tap();
  await expect(sheet(page)).toHaveCount(0);

  // Raderna: havregryn 6 g, mjölk "–".
  const breakfast = page.getByTestId('meal-frukost');
  const rows = breakfast.getByTestId('food-entry');
  await expect(rows.filter({ hasText: 'Havregryn' }).getByTestId('entry-macros')).toHaveText(
    '60 g · P 7,8 g · K 35 g · F 4,2 g · Fi 6 g',
  );
  await expect(rows.filter({ hasText: 'Mjölk' }).getByTestId('fiber')).toContainText('Fi –');

  // Måltidens rubrik: summan utan mjölken, med markering att den kan vara i underkant.
  const mealMacros = breakfast.getByTestId('meal-macros');
  await expect(mealMacros.getByTestId('fiber')).toContainText('Fi 6 g');
  await expect(mealMacros.getByTestId('fiber-partial')).toBeVisible();
  // Tomma måltider har ingen makrorad.
  await expect(page.getByTestId('meal-lunch').getByTestId('meal-macros')).toHaveCount(0);

  // Dagens topp: fiber i makroraden, markering och en diskret förklaring.
  const day = page.getByTestId('macros');
  await expect(day).toContainText('Protein 15 g · Kolhydrater 45 g · Fett 10 g · Fiber 6 g*');
  await expect(day.getByTestId('fiber-partial')).toBeVisible();
  await expect(page.getByTestId('fiber-incomplete')).toHaveText(
    '* Dagens fiber kan vara i underkant – 1 post saknar fiberdata.',
  );
  // Fibermålet är av: ingen fiberstapel.
  await expect(page.getByTestId('fiber-intake')).toHaveCount(0);

  // Samma färg som fiberringen.
  const color = await day.getByTestId('fiber').evaluate((el) => getComputedStyle(el).color);
  const token = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--macro-fiber)';
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  });
  expect(color).toBe(token);

  expect(errors).toEqual([]);
});
