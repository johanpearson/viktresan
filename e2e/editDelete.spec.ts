import { expect, test, type Page } from '@playwright/test';
import { collectErrors, dump, isoDaysFromToday, seed, swipeLeft } from './helpers.ts';

/**
 * Det användaren skapat: detaljvy med Redigera, Ta bort med bekräftelse i detaljvyn och svep
 * med Ångra i listan. Borttagning påverkar aldrig loggen.
 */

// Service workern skulle annars svara på livsmedel.json från sin cache, förbi page.route.
test.use({ serviceWorkers: 'block' });

const LIVSMEDEL = {
  format: 'viktresan-livsmedel',
  source: 'Testdatabas',
  license: 'CC BY 4.0',
  retrieved: '2026-09-01',
  foods: [[4, 'Potatis kokt', 80, 2, 17, 0.1]],
};

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

const POTATIS = { kcal: 80, proteinG: 2, carbsG: 17, fatG: 0.1 };

/** Linsgryta: 4 portioner à 300 g, 400 kcal per portion. */
const STEW = {
  id: 'linsgryta',
  name: 'Linsgryta',
  items: [
    { foodId: 'lv:4', name: 'Potatis kokt', amount: 2000, unit: 'g', grams: 2000, per100: POTATIS },
  ],
  servings: 4,
  cookedWeightG: 1200,
  createdAt: Date.now() - 86_400_000,
};

/** En loggad portion med receptets kopia (som när den loggades). */
function loggedPortion(id: string, date: string) {
  return {
    id,
    date,
    meal: 'lunch',
    foodId: 'recept:linsgryta',
    name: 'Linsgryta',
    amount: 1,
    unit: 'portion',
    grams: 300,
    per100: { kcal: 133.3, proteinG: 3.3, carbsG: 28.3, fatG: 0.2 },
    recipe: { yieldG: 1200, items: STEW.items },
    createdAt: Date.now() - 3_600_000,
  };
}

async function start(page: Page, data: Record<string, unknown>, path: string) {
  await page.route('**/livsmedel.json', (route) => route.fulfill({ json: LIVSMEDEL }));
  await page.route('**/fineli.json', (route) =>
    route.fulfill({ json: { format: 'viktresan-livsmedel', foods: [] } }),
  );
  await page.goto('./');
  await seed(page, { profile: PROFILE, ...data });
  // Bara adressens hash ändras: ladda om så att appen läser den seedade datan och funktionerna.
  await page.goto(path);
  await page.reload();
}

test('ta bort ett recept med loggar: bekräftelsen förklarar, loggarna finns kvar', async ({
  page,
}) => {
  const errors = collectErrors(page);
  const today = isoDaysFromToday(0);
  await start(
    page,
    {
      recipes: [{ ...STEW, batch: { startedAt: Date.now() - 3_600_000, portions: 4 } }],
      foodLog: [loggedPortion('a', isoDaysFromToday(-1)), loggedPortion('b', today)],
    },
    './#/mat',
  );
  await page.getByRole('button', { name: 'Egna', exact: true }).tap();
  const row = page.getByTestId('own-recipe').filter({ hasText: 'Linsgryta' });
  await row.getByRole('button').first().tap();
  const detail = page.getByTestId('own-detail');
  await expect(detail).toContainText('4 portioner');
  await expect(detail).toContainText('400 kcal');
  await expect(detail).toContainText('2 loggade poster');
  // Ett loggat recept har kvar matlådor: 4 − 2 = 2 portioner kvar.
  await expect(detail).toContainText('2 portioner kvar');

  await detail.getByRole('button', { name: 'Ta bort receptet' }).tap();
  const confirm = page.getByRole('dialog', { name: 'Ta bort Linsgryta?' });
  await expect(confirm).toContainText(
    '2 loggade poster finns kvar – de har en egen kopia av receptet.',
  );
  await expect(confirm).toContainText('Matlådorna (2 portioner kvar) försvinner också.');
  await confirm.getByRole('button', { name: 'Ta bort', exact: true }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row).toHaveCount(0);
  await expect(page.getByTestId('own-toast')).toContainText(
    'Tog bort Linsgryta. Loggen påverkas inte.',
  );

  // Loggarna finns kvar oförändrade – även ingredienserna i den loggade portionen.
  const stored = await dump(page);
  expect(stored.recipes).toEqual([]);
  expect(stored.foodLog).toHaveLength(2);
  expect(stored.foodLog).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'a', name: 'Linsgryta', grams: 300 }),
      expect.objectContaining({ id: 'b', name: 'Linsgryta', grams: 300 }),
    ]),
  );
  await page.getByRole('button', { name: 'Dag', exact: true }).tap();
  const lunch = page.getByTestId('meal-lunch');
  await expect(lunch.getByRole('heading')).toContainText('400 kcal');
  const toggle = lunch.getByRole('heading').getByRole('button');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.tap();
  const entry = page.getByTestId('food-entry').filter({ hasText: 'Linsgryta' });
  await expect(entry).toContainText('400 kcal');
  await entry.getByRole('button', { name: 'Ingredienser i Linsgryta' }).tap();
  await expect(page.getByTestId('meal-ingredients')).toContainText('Potatis kokt · 500 g');

  expect(errors).toEqual([]);
});

test('träningspass: detaljvy, Redigera och Ta bort med bekräftelse och Ångra', async ({ page }) => {
  const errors = collectErrors(page);
  const today = isoDaysFromToday(0);
  const base = { date: today, type: 'Styrka', durationMin: 45, status: 'genomford', createdAt: 1 };
  await start(page, { workouts: [{ ...base, id: 'pass', time: '07:00' }] }, './#/kalender');
  const row = page.getByTestId('calendar-day').getByTestId('workout');
  await expect(row).toContainText('Styrka');
  await row.getByRole('button').tap();
  const detail = page.getByTestId('workout-detail');
  await expect(detail).toContainText('45 min');
  await detail.getByRole('button', { name: 'Redigera' }).tap();
  const edit = page.getByTestId('workout-form');
  await expect(edit.getByRole('heading', { name: 'Redigera pass' })).toBeVisible();
  await edit.getByLabel('Längd (min)').fill('60');
  await edit.getByRole('button', { name: 'Spara ändringar' }).tap();
  await expect(edit).toHaveCount(0);
  await expect(row).toContainText('60 min');
  expect((await dump(page)).workouts).toEqual([
    expect.objectContaining({ id: 'pass', durationMin: 60, status: 'genomford' }),
  ]);

  await row.getByRole('button').tap();
  await detail.getByRole('button', { name: 'Ta bort passet' }).tap();
  const confirm = page.getByRole('dialog', { name: /^Ta bort Styrka/ });
  await expect(confirm).toContainText('Andra pass och scheman påverkas inte.');
  await confirm.getByRole('button', { name: 'Ta bort', exact: true }).tap();
  await expect(row).toHaveCount(0);
  await page.getByRole('button', { name: 'Ångra' }).tap();
  await expect(row).toContainText('60 min');
  expect(errors).toEqual([]);
});

test('tillskott och fototillfällen: detaljvy och svep med Ångra', async ({ page }) => {
  const errors = collectErrors(page);
  const today = isoDaysFromToday(0);
  await start(
    page,
    {
      settings: { features: { tillskott: true, version: 4 } },
      supplements: [
        {
          id: 'd3',
          name: 'D-vitamin',
          form: 'tablett',
          amountPerDose: 1,
          nutrients: [{ key: 'vitaminD', amount: 25, unit: 'µg' }],
          schedule: 'dagligen',
          dosesPerDay: 1,
          createdAt: 1,
        },
      ],
      supplementLog: [
        {
          id: `d3:${today}`,
          date: today,
          supplementId: 'd3',
          name: 'D-vitamin',
          doses: 1,
          nutrients: [{ key: 'vitaminD', amount: 25, unit: 'µg' }],
          createdAt: 2,
        },
      ],
      photoSessions: [{ id: 's1', date: today, weightKg: 88, createdAt: 1 }],
      photos: [{ id: 'p1', sessionId: 's1', date: today, angle: 'fram', createdAt: 1, bytes: [1] }],
    },
    './#/logga/tillskott',
  );
  const sheet = page.getByRole('dialog', { name: 'Tillskott' });
  const supplement = sheet.getByTestId('supplement');
  await supplement.getByRole('button').tap();
  const detail = page.getByTestId('supplement-detail');
  await expect(detail).toContainText('Vitamin D 25 µg');
  await detail.getByRole('button', { name: 'Ta bort tillskottet' }).tap();
  const confirm = page.getByRole('dialog', { name: 'Ta bort D-vitamin?' });
  await expect(confirm).toContainText('1 tagen dos finns kvar i historiken');
  await confirm.getByRole('button', { name: 'Ta bort', exact: true }).tap();
  await expect(supplement).toHaveCount(0);
  const stored = await dump(page);
  expect(stored.supplements).toEqual([]);
  expect(stored.supplementLog).toHaveLength(1);

  // Fototillfälle: svep tar bort med bilden, Ångra lägger tillbaka båda.
  await page.goto('./#/framsteg/bilder');
  const session = page.getByTestId('photo-session');
  await expect(session).toHaveCount(1);
  await swipeLeft(session);
  await expect(session).toHaveCount(0);
  await page.getByTestId('photo-toast').getByRole('button', { name: 'Ångra' }).tap();
  await expect(session).toHaveCount(1);
  await expect(session.getByTestId('photo')).toHaveCount(1);
  await session.getByRole('button').first().tap();
  const sessionDetail = page.getByTestId('session-detail');
  await expect(sessionDetail).toContainText('88,0 kg');
  await sessionDetail.getByRole('button', { name: 'Ta bort tillfället' }).tap();
  await expect(page.getByRole('dialog', { name: /^Ta bort tillfället/ })).toContainText(
    'Vikter i viktloggen påverkas inte.',
  );
  expect(errors).toEqual([]);
});
