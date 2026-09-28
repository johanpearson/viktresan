import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectErrors, dump, seed } from './helpers.ts';

/**
 * Snabblogg, recept med portioner och veckobudget. Tiden styrs med page.clock:
 * onsdag 2026-09-23 18:30 (lokal tid) – veckan började måndag 21 september.
 */
const MONDAY = '2026-09-21';
const TUESDAY = '2026-09-22';
const WEDNESDAY = '2026-09-23';

// Service workern skulle annars svara på livsmedel.json från sin cache, förbi page.route.
test.use({ serviceWorkers: 'block' });

/** Påhittade testvärden i Livsmedelsverket-formatet – inte riktiga data. */
const LIVSMEDEL = {
  format: 'viktresan-livsmedel',
  source: 'Testdatabas',
  license: 'CC BY 4.0',
  retrieved: '2026-09-01',
  foods: [
    [4, 'Potatis kokt', 80, 2, 17, 0.1],
    [5, 'Ägg kokt', 136, 12.1, 0, 9.8],
  ],
};

/** Man född 1986, 180 cm, måttligt aktiv, 0,5 kg/vecka, ingen vikt loggad (trend = 90 kg). */
const PROFILE = {
  startDate: '2026-09-01',
  startWeightKg: 90,
  heightCm: 180,
  goalWeightKg: 80,
  sex: 'man',
  birthYear: 1986,
  activityLevel: 'mattlig',
  ratePerWeekKg: 0.5,
};

/** Samma beräkning som appen (år 2026 → 40 år): Mifflin-St Jeor × 1,55 − 550. */
function dailyTarget(): number {
  const bmr = 10 * 90 + 6.25 * 180 - 5 * 40 + 5;
  return Math.round(bmr * 1.55 - 550);
}

function kcalText(value: number): string {
  return new Intl.NumberFormat('sv-SE').format(value).replace(/\s/g, ' ');
}

async function start(page: Page, data: Parameters<typeof seed>[1] = {}, hash = '#/mat') {
  await page.clock.setFixedTime(new Date(`${WEDNESDAY}T18:30:00`));
  await page.route('**/livsmedel.json', (route) => route.fulfill({ json: LIVSMEDEL }));
  await page.goto('./');
  await seed(page, { profile: PROFILE, ...data });
  await page.goto(`./${hash}`);
}

function sheet(page: Page): Locator {
  return page.getByRole('dialog');
}

function entry(page: Page, name: string): Locator {
  return page.getByTestId('food-entry').filter({ hasText: name });
}

function logEntry(id: string, date: string, kcal: number) {
  return {
    id,
    date,
    meal: 'lunch',
    foodId: `egen:${id}`,
    name: `Mat ${id}`,
    amount: 100,
    unit: 'g',
    grams: 100,
    per100: { kcal, proteinG: 20, carbsG: 50, fatG: 10 },
    createdAt: Date.parse(`${date}T12:00:00`),
  };
}

test('snabbloggar en restaurangmiddag som räknas men märks uppskattad', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  const target = dailyTarget();
  await expect(page.getByTestId('intake')).toHaveText(`0 / ${kcalText(target)} kcal`);

  // + i middagen → sök-sheeten → Snabblogg.
  await page.getByRole('button', { name: 'Lägg till i middag' }).tap();
  await expect(page.getByRole('dialog', { name: 'Lägg till i middag' })).toBeVisible();
  await sheet(page).getByTestId('quick-log-open').getByRole('button').tap();
  const form = page.getByTestId('quick-log-form');
  await expect(form.getByLabel('Måltid')).toHaveValue('middag');
  await form.getByRole('button', { name: 'Logga' }).tap();
  await expect(form.getByRole('alert')).toHaveText('Ange ungefär hur många kcal (1–10 000).');
  await form.getByLabel('Namn (valfritt)').fill('Restaurang');
  await form.getByLabel('Kcal').fill('850');
  await form.getByLabel('Protein, g (valfritt)').fill('40');
  // Favorit direkt i formuläret.
  await form.getByRole('button', { name: 'Favorit' }).tap();
  await expect(form.getByRole('button', { name: 'Favorit' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await form.getByRole('button', { name: 'Logga' }).tap();
  await expect(sheet(page).getByRole('status').filter({ hasText: 'Loggade' })).toHaveText(
    'Loggade Restaurang (≈ 850 kcal) till middag.',
  );

  // Snabbloggen finns under Senaste och Favoriter som "≈ 850 kcal".
  await expect(
    sheet(page).getByTestId('quick-pick').filter({ hasText: 'Restaurang' }),
  ).toContainText('≈ 850 kcal · 40 g protein');
  await sheet(page).getByRole('button', { name: 'Favoriter' }).tap();
  await expect(sheet(page).getByTestId('quick-pick')).toContainText('Restaurang');
  await sheet(page).getByRole('button', { name: 'Stäng', exact: true }).tap();

  // En vanlig rad i dagsvyn med etiketten "uppskattat", räknad i summan.
  const row = entry(page, 'Restaurang');
  await expect(row).toContainText('uppskattat');
  await expect(row).toContainText('850 kcal');
  await expect(page.getByTestId('intake')).toHaveText(`850 / ${kcalText(target)} kcal`);

  // Tryck = redigera i snabbloggens formulär.
  await row.getByRole('button').first().tap();
  const edit = page.getByRole('dialog', { name: 'Redigera post' });
  await expect(edit.getByLabel('Kcal')).toHaveValue('850');
  await edit.getByLabel('Kcal').fill('900');
  await edit.getByRole('button', { name: 'Spara ändringar' }).tap();
  await expect(page.getByTestId('intake')).toHaveText(`900 / ${kcalText(target)} kcal`);

  // Näring: snabbloggen ingår inte, med en notis om att dagens näring är ofullständig.
  await page.getByRole('button', { name: 'Näring', exact: true }).tap();
  await expect(page.getByTestId('nutrition-estimated')).toHaveText(
    'Näringen idag är ofullständig: 1 snabblogg har bara uppskattade kcal och ingår inte i vitaminer och mineraler.',
  );

  const stored = await dump(page);
  expect(stored.foodLog).toEqual([
    expect.objectContaining({
      name: 'Restaurang',
      meal: 'middag',
      estimated: true,
      per100: { kcal: 900, proteinG: 40, carbsG: 0, fatG: 0 },
    }),
  ]);
  expect(stored.favorites).toEqual([
    expect.objectContaining({ foodId: 'snabb:restaurang:850:40' }),
  ]);
  expect(errors).toEqual([]);
});

test('skapar en gryta med 6 portioner, loggar 1 och en ändring påverkar inte loggen', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await start(page);
  await page.getByRole('button', { name: 'Egna', exact: true }).tap();
  await page.getByRole('button', { name: 'Nytt recept' }).tap();
  await page.getByLabel('Receptets namn').fill('Veckans gryta');

  // Ingredienser med sök-sheeten: 1 200 g potatis (960 kcal) och 600 g ägg (816 kcal).
  for (const [query, name, grams] of [
    ['potatis', 'Potatis kokt', '1200'],
    ['ägg', 'Ägg kokt', '600'],
  ] as const) {
    await page.getByRole('button', { name: 'Lägg till ingrediens' }).tap();
    const picker = page.getByRole('dialog', { name: 'Lägg till ingrediens' });
    await picker.getByLabel('Sök livsmedel').fill(query);
    await picker.getByTestId('search-result').filter({ hasText: name }).first().tap();
    await picker
      .getByRole('group', { name: 'Enhet' })
      .getByRole('button', { name: 'g', exact: true })
      .tap();
    await picker.getByLabel('Mängd (g)').fill(grams);
    await picker.getByRole('button', { name: 'Lägg till', exact: true }).tap();
    await expect(picker).toHaveCount(0);
  }
  await expect(page.getByTestId('meal-total')).toHaveText('Ingredienser 1 800 g · 1 776 kcal');

  await page.getByRole('button', { name: 'Spara recept' }).tap();
  await expect(page.getByRole('alert')).toHaveText(
    'Ange antal portioner, tillagad vikt eller båda.',
  );
  await page.getByLabel('Antal portioner').fill('6');
  await page.getByLabel('Tillagad vikt (g)').fill('1500');
  // 1 776 kcal / 6 = 296 kcal; 96,6 g protein / 6 ≈ 16 g. Per 100 g tillagad: 118 kcal.
  await expect(page.getByTestId('recipe-per-portion')).toContainText('296 kcal · 16 g protein');
  await expect(page.getByTestId('recipe-per-portion')).toContainText('≈ 250 g');
  await expect(page.getByTestId('recipe-per-100')).toContainText('118 kcal');
  await page.getByRole('button', { name: 'Spara recept' }).tap();
  const recipeRow = page.getByTestId('own-recipe').filter({ hasText: 'Veckans gryta' });
  await expect(recipeRow).toContainText('6 portioner · 1 500 g tillagad');
  await expect(recipeRow).toContainText('296 kcal/portion');

  // Logga 1 portion (snabbval ½, 1, 1½, 2).
  await page.getByRole('button', { name: 'Dag', exact: true }).tap();
  await page.getByRole('button', { name: 'Sök och logga mat' }).tap();
  await sheet(page).getByLabel('Sök livsmedel').fill('veckans gryta');
  await sheet(page).getByTestId('search-result').filter({ hasText: 'Veckans gryta' }).tap();
  const form = page.getByTestId('food-log-form');
  await expect(form.getByLabel('Mängd (portion)')).toHaveValue('1');
  const quick = form.getByRole('group', { name: 'Snabbval mängd' });
  await expect(quick.getByRole('button')).toHaveText(['½', '1', '1½', '2']);
  await quick.getByRole('button', { name: '1½ portion' }).tap();
  await expect(form.getByTestId('log-preview')).toHaveText('1,5 portion ≈ 375 g · 444 kcal');
  await quick.getByRole('button', { name: '1 portion' }).tap();
  await form.getByRole('button', { name: 'Logga', exact: true }).tap();
  await sheet(page).getByRole('button', { name: 'Stäng', exact: true }).tap();
  await expect(entry(page, 'Veckans gryta')).toContainText('296 kcal');

  // Ingredienserna kan fällas ut på den loggade portionen.
  await entry(page, 'Veckans gryta')
    .getByRole('button', { name: 'Ingredienser i Veckans gryta' })
    .tap();
  await expect(page.getByTestId('meal-ingredients')).toContainText('Potatis kokt · 200 g');

  // Ändra receptet: 8 portioner. Den loggade portionen är oförändrad.
  await page.getByRole('button', { name: 'Egna', exact: true }).tap();
  await recipeRow.getByRole('button').first().tap();
  await page.getByLabel('Antal portioner').fill('8');
  await page.getByRole('button', { name: 'Spara recept' }).tap();
  await expect(recipeRow).toContainText('222 kcal/portion');
  await page.getByRole('button', { name: 'Dag', exact: true }).tap();
  await expect(entry(page, 'Veckans gryta')).toContainText('296 kcal');

  // Duplicera för en variant.
  await page.getByRole('button', { name: 'Egna', exact: true }).tap();
  await recipeRow.getByRole('button').first().tap();
  await page.getByRole('button', { name: 'Duplicera recept' }).tap();
  await expect(page.getByLabel('Receptets namn')).toHaveValue('Veckans gryta (kopia)');
  await page.getByLabel('Receptets namn').fill('Gryta utan ägg');
  await page.getByRole('button', { name: 'Ta bort ingrediensen Ägg kokt' }).tap();
  await page.getByRole('button', { name: 'Spara recept' }).tap();
  await expect(page.getByTestId('own-recipe')).toHaveCount(2);

  const stored = await dump(page);
  expect(stored.recipes).toHaveLength(2);
  expect(stored.foodLog).toEqual([
    expect.objectContaining({
      name: 'Veckans gryta',
      amount: 1,
      unit: 'portion',
      grams: 250,
      recipe: expect.objectContaining({ yieldG: 1500 }),
    }),
  ]);
  expect(errors).toEqual([]);
});

test('växlar till veckoläge och ser dagens förslag i Mat och på Översikt', async ({ page }) => {
  const errors = collectErrors(page);
  // Mån 3 000 och tis 2 500 kcal.
  await start(
    page,
    { foodLog: [logEntry('m', MONDAY, 3000), logEntry('t', TUESDAY, 2500)] },
    '#/installningar/kalorimal',
  );
  const target = dailyTarget();
  const budget = target * 7;
  const suggestion = Math.round((budget - 5500) / 5);

  const panel = page.getByRole('dialog', { name: 'Kalorimål' });
  await expect(panel.getByLabel('Per dag')).toBeChecked();
  // Sparas direkt (profilen läses om), så kontrollera efteråt i stället för check().
  await panel.getByLabel('Per vecka').tap();
  await expect(panel.getByLabel('Per vecka')).toBeChecked();
  await expect(panel.getByRole('status')).toContainText('Kalorimålet räknas nu per vecka.');
  await expect(panel.getByTestId('week-budget-explained')).toContainText(
    `= ${kcalText(budget)} kcal`,
  );
  await panel.getByRole('button', { name: 'Stäng', exact: true }).tap();
  await expect(page.getByTestId('settings-kalorimal')).toContainText('Vecka');

  // Mat → Dag: dagens förslag som mål och veckans status.
  await page.goto('./#/mat');
  await expect(page.getByTestId('intake')).toHaveText(`0 / ${kcalText(suggestion)} kcal`);
  const week = page.getByTestId('week-budget-status');
  await expect(week.getByTestId('week-suggestion')).toHaveText(
    `Förslag idag ${kcalText(suggestion)} kcal`,
  );
  await expect(week.getByTestId('week-budget-used')).toContainText(
    `5 500 / ${kcalText(budget)} kcal`,
  );
  await expect(week.getByTestId('week-budget-left')).toHaveText(
    `${kcalText(budget - 5500)} kcal kvar · 5 dagar kvar`,
  );

  // Översikt: ringen och veckans status.
  await page.goto('./');
  const today = page.getByTestId('today-card');
  await expect(today.getByTestId('week-suggestion')).toHaveText(
    `Förslag idag ${kcalText(suggestion)} kcal`,
  );
  await expect(today.getByText(`av ${kcalText(suggestion)}`)).toBeVisible();
  expect((await dump(page)).profile).toEqual(expect.objectContaining({ calorieMode: 'vecka' }));
  expect(errors).toEqual([]);
});

test('veckoläge: räcker inte budgeten föreslås golvet och resten över nästa vecka', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await start(page, {
    profile: { ...PROFILE, calorieMode: 'vecka' },
    foodLog: [logEntry('m', MONDAY, 9000), logEntry('t', TUESDAY, 8000)],
  });
  const available = dailyTarget() * 7 - 17_000;
  const carry = 1500 * 5 - available;
  await expect(page.getByTestId('intake')).toHaveText('0 / 1 500 kcal');
  await expect(page.getByTestId('week-shortfall')).toHaveText(
    `Budgeten räcker inte till kalorigolvet (1 500 kcal per dag) resten av veckan. Ät hellre 1 500 kcal per dag och fördela resten, ${kcalText(carry)} kcal, över nästa vecka (ca ${kcalText(Math.round(carry / 7))} kcal mindre per dag).`,
  );
  expect(errors).toEqual([]);
});
