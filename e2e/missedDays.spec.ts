import { expect, test, type Page } from '@playwright/test';
import { collectErrors, dump, isoDaysFromToday, seed } from './helpers.ts';

test.use({ serviceWorkers: 'block' });

const PROFILE = {
  startDate: isoDaysFromToday(-20),
  startWeightKg: 90,
  heightCm: 180,
  goalWeightKg: 80,
  sex: 'man',
  birthYear: 1986,
  activityLevel: 'mattlig',
  ratePerWeekKg: 0.5,
};

/** Frukost 400 kcal och middag 700 kcal fyra dagar (−5 till −2); igår saknas. */
function foodLog() {
  return [-5, -4, -3, -2].flatMap((day) =>
    (
      [
        ['frukost', 400, 20],
        ['middag', 700, 40],
      ] as const
    ).map(([meal, kcal, proteinG]) => ({
      id: `${String(day)}:${meal}`,
      date: isoDaysFromToday(day),
      meal,
      foodId: 'lv:1',
      name: 'Gröt',
      amount: 100,
      unit: 'g',
      grams: 100,
      per100: { kcal, proteinG, carbsG: 0, fatG: 0 },
      createdAt: Date.now() + day * 86_400_000,
    })),
  );
}

async function open(page: Page) {
  await page.route('**/livsmedel.json', (route) =>
    route.fulfill({ json: { format: 'viktresan-livsmedel', foods: [] } }),
  );
  await page.route('**/fineli.json', (route) =>
    route.fulfill({ json: { format: 'viktresan-livsmedel', foods: [] } }),
  );
  await page.goto('./');
  await seed(page, { profile: PROFILE, foodLog: foodLog() });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Översikt');
}

test('glömt logga: "Som vanligt" lägger in en uppskattad dag med Ångra', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  const row = page.getByTestId('todo-missed');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Ingen mat loggad igår');
  await row.getByRole('button').tap();

  const menu = page.getByRole('dialog', { name: 'Ingen mat loggad igår' });
  await expect(menu).toContainText('inte när förbrukningen räknas ut');
  await menu.getByRole('button', { name: 'Som vanligt (≈ 1 100 kcal)' }).tap();
  await expect(page.getByTestId('supplement-toast')).toContainText(
    'La in en vanlig dag för igår (≈ 1 100 kcal).',
  );
  await expect(row).toHaveCount(0);
  type Entry = { usual?: boolean; meal?: string };
  // I måltidsordning (dumpen ordnas på id, som är slumpmässigt).
  const usualOf = (log: unknown[]) =>
    (log as Entry[])
      .filter((e) => e.usual === true)
      .sort((a, b) => (a.meal === b.meal ? 0 : a.meal === 'frukost' ? -1 : 1));
  let stored = await dump(page);
  const usual = usualOf(stored.foodLog);
  expect(usual).toEqual([
    expect.objectContaining({ date: isoDaysFromToday(-1), meal: 'frukost', name: 'Som vanligt' }),
    expect.objectContaining({ date: isoDaysFromToday(-1), meal: 'middag', estimated: true }),
  ]);

  // Ångra tar bort posterna och frågan kommer tillbaka.
  await page.getByTestId('supplement-toast').getByRole('button', { name: 'Ångra' }).tap();
  await expect(row).toHaveCount(1);
  stored = await dump(page);
  expect(usualOf(stored.foodLog)).toEqual([]);
  expect(errors).toEqual([]);
});

test('glömt logga: Hoppa över och Fyll i', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  const row = page.getByTestId('todo-missed');

  // Fyll i: Mat på gårdagen med sök-sheeten öppen.
  await row.getByRole('button').tap();
  await page.getByRole('dialog').getByRole('button', { name: 'Fyll i' }).tap();
  await expect(page.getByRole('dialog', { name: 'Logga mat' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Stäng', exact: true }).tap();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mat');
  await expect(page.locator('.date-bar')).toContainText('Igår');

  // Hoppa över: frågan försvinner och sparas.
  await page.goto('./');
  await row.getByRole('button').tap();
  await page.getByRole('dialog').getByRole('button', { name: 'Hoppa över' }).tap();
  await expect(row).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Översikt');
  await expect(page.getByTestId('todo-card').or(page.getByTestId('todo-done'))).toBeVisible();
  await expect(row).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('ett ogiltigt datum i adressen ger dagens Mat utan sök-sheet', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await page.goto('./#/mat/logga/2026-02-30');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mat');
  await expect(page.locator('.date-bar')).toContainText('Idag');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('plusknappen i mitten av navigeringen öppnar Logga, där Mat finns', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  const nav = page.getByRole('navigation', { name: 'Huvudmeny' });
  await expect(nav.getByRole('link')).toHaveText([
    'Översikt',
    'Mat',
    'Logga',
    'Kalender',
    'Framsteg',
  ]);
  await nav.getByRole('link', { name: 'Logga' }).tap();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Logga');
  const food = page.getByTestId('log-tile-mat');
  await expect(food).toContainText('Mat');
  await expect(food).toContainText('Idag 0 kcal');
  await food.tap();
  await expect(page.getByRole('dialog', { name: 'Logga mat' })).toBeVisible();
  expect(errors).toEqual([]);
});
