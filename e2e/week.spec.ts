import { expect, test, type Page } from '@playwright/test';
import { collectErrors, seed } from './helpers.ts';

/**
 * Tiden styrs med page.clock: måndag 2026-09-21 (vecka 39). Förra veckan är
 * vecka 38 (14–20 sep), veckan innan vecka 37.
 */
const MONDAY = '2026-09-21';

const PROFILE = {
  startDate: '2026-08-01',
  startWeightKg: 90,
  heightCm: 180,
  goalWeightKg: 80,
  sex: 'kvinna',
  birthYear: 1985,
  activityLevel: 'latt',
  ratePerWeekKg: 0.5,
};

let n = 0;
const id = () => `id${String(++n)}`;
const weight = (date: string, weightKg: number) => ({ id: id(), date, weightKg, createdAt: 1 });
const food = (date: string, kcal: number, proteinG: number) => ({
  id: id(),
  date,
  meal: 'lunch',
  foodId: 'egen:x',
  name: 'Mat',
  amount: 100,
  unit: 'g',
  grams: 100,
  per100: { kcal, proteinG, carbsG: 0, fatG: 0 },
  createdAt: 1,
});
const water = (date: string, ml: number) => ({ id: id(), date, ml, createdAt: 1 });
const workout = (date: string) => ({
  id: id(),
  date,
  type: 'Promenad',
  durationMin: 30,
  status: 'genomford',
  createdAt: 1,
});
const steps = (date: string, value: number) => ({ date, steps: value, createdAt: 1 });

const DATA = {
  profile: PROFILE,
  weights: [
    weight('2026-09-07', 86),
    weight('2026-09-10', 85.8),
    weight('2026-09-13', 85.6),
    weight('2026-09-15', 85.4),
    weight('2026-09-18', 85),
    weight('2026-09-20', 84.9),
  ],
  foodLog: [
    food('2026-09-08', 2100, 90),
    food('2026-09-14', 1800, 120),
    food('2026-09-16', 2000, 100),
  ],
  water: [water('2026-09-09', 1000), water('2026-09-14', 2000), water('2026-09-15', 1500)],
  workouts: [workout('2026-09-09'), workout('2026-09-15'), workout('2026-09-17')],
  steps: [steps('2026-09-10', 7000), steps('2026-09-14', 8000), steps('2026-09-16', 10000)],
};

async function start(page: Page, data: Parameters<typeof seed>[1], date = MONDAY) {
  await page.clock.setFixedTime(new Date(`${date}T09:00:00`));
  await page.goto('./');
  await seed(page, data);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Översikt');
}

test('veckokortet på måndagen: förra veckan mot veckan innan, stängs och finns under Veckor', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await start(page, DATA);

  const card = page.getByTestId('week-card');
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading', { name: 'Förra veckan' })).toBeVisible();
  await expect(card).toContainText(/Vecka 38 · 14 sep\.?–20 sep\.?/);
  await expect(card.getByTestId('week-headline')).toHaveText(/^Trenden rörde sig .* mot målet\./);

  await expect(card.getByTestId('week-trend')).toContainText('−');
  await expect(card.getByTestId('week-kcal')).toContainText('1 900 kcal (mål');
  await expect(card.getByTestId('week-kcal')).toContainText('2 dagar');
  await expect(card.getByTestId('week-protein')).toContainText('110 g (mål 128 g)');
  await expect(card.getByTestId('week-vatten')).toContainText('1 750 ml');
  await expect(card.getByTestId('week-traning')).toContainText('2');
  await expect(card.getByTestId('week-steg')).toContainText('9 000');

  // Pilar mot vecka 37.
  const arrow = (row: string) => card.getByTestId(`week-${row}`).locator('.week-arrow');
  await expect(arrow('kcal')).toHaveAttribute('data-direction', 'down');
  await expect(arrow('kcal')).toContainText('lägre än veckan innan');
  await expect(arrow('protein')).toHaveAttribute('data-direction', 'up');
  await expect(arrow('vatten')).toHaveAttribute('data-direction', 'up');
  await expect(arrow('traning')).toHaveAttribute('data-direction', 'up');
  await expect(arrow('steg')).toHaveAttribute('data-direction', 'up');

  // Stäng: borta även efter omladdning.
  await card.getByRole('button', { name: 'Stäng veckosummeringen' }).tap();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Översikt');
  await expect(page.getByTestId('today-card')).toBeVisible();
  await expect(card).toHaveCount(0);

  // Framsteg → Veckor: vecka 38 och 37, senaste först.
  await page.goto('./#/framsteg/veckor');
  await expect(page.getByRole('button', { name: 'Veckor' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const list = page.getByTestId('week-list');
  await expect(list.getByRole('heading', { level: 2 })).toHaveText([/^Vecka 38/, /^Vecka 37/]);
  await expect(list.getByTestId('week-protein').first()).toContainText('110 g');
  expect(errors).toEqual([]);
});

test('veckokortet visas hela veckan tills det stängs, även senare i veckan', async ({ page }) => {
  await start(page, DATA, '2026-09-24');
  await expect(page.getByTestId('week-card')).toContainText('Vecka 38');
});

test('uppgång beskrivs neutralt och avstängda funktioner syns inte', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, {
    ...DATA,
    weights: [weight('2026-09-12', 84), weight('2026-09-15', 85), weight('2026-09-19', 85.5)],
    settings: { features: { mat: false, steg: false, version: 3 } },
  });
  const card = page.getByTestId('week-card');
  await expect(card.getByTestId('week-headline')).toHaveText(
    'Trenden planade ut, det händer. En vecka säger lite – det är riktningen över tid som räknas.',
  );
  await expect(card.getByTestId('week-trend')).toContainText('+');
  await expect(card.getByTestId('week-kcal')).toHaveCount(0);
  await expect(card.getByTestId('week-protein')).toHaveCount(0);
  await expect(card.getByTestId('week-steg')).toHaveCount(0);
  await expect(card.getByTestId('week-vatten')).toBeVisible();
  expect(errors).toEqual([]);
});

test('trendvikt som huvudsiffra, dagsvikt under och inställning för att stänga av', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await start(page, {
    profile: PROFILE,
    weights: [weight('2026-09-19', 86), weight('2026-09-20', 84), weight('2026-09-21', 85)],
  });
  const hero = page.getByTestId('hero');
  await expect(hero.getByText('Trendvikt')).toBeVisible();
  // EMA: 86 → 85,8 → 85,72.
  await expect(page.getByTestId('trend-weight')).toHaveText('85,7 kg');
  await expect(page.getByTestId('current-weight')).toHaveText('85,0 kg');
  await expect(page.getByTestId('trend-note')).toContainText('vätska och salt');

  await page.goto('./#/installningar');
  const toggle = page.getByRole('switch', { name: /Visa trendvikt som huvudsiffra/ });
  await expect(toggle).toBeChecked();
  await toggle.tap();
  await expect(toggle).not.toBeChecked();
  await page.goto('./#/');
  await expect(hero.getByText('Nuvarande vikt')).toBeVisible();
  await expect(page.getByTestId('current-weight')).toHaveText('85,0 kg');
  await expect(page.getByTestId('trend-weight')).toHaveCount(0);
  await expect(page.getByTestId('trend-note')).toHaveCount(0);
  expect(errors).toEqual([]);
});
