import { expect, test, type Page } from '@playwright/test';
import { collectErrors, dump, seed } from './helpers.ts';

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

  // Kortet är en rad; hela summeringen ligger under Framsteg → Veckor (tryck på raden).
  await expect(card.getByTestId('week-kcal')).toHaveCount(0);
  await card.getByRole('link').tap();
  await page.getByTestId('week-list').getByTestId('week').first().getByRole('button').tap();
  const summary = page.getByRole('dialog');
  await expect(summary.getByTestId('week-trend')).toContainText('−');
  await expect(summary.getByTestId('week-kcal')).toContainText('1 900 kcal (mål');
  await expect(summary.getByTestId('week-kcal')).toContainText('2 dagar');
  await expect(summary.getByTestId('week-protein')).toContainText('110 g (mål 128 g)');
  await expect(summary.getByTestId('week-vatten')).toContainText('1 750 ml');
  await expect(summary.getByTestId('week-traning')).toContainText('2');
  await expect(summary.getByTestId('week-steg')).toContainText('9 000');

  // Pilar mot vecka 37.
  const arrow = (row: string) => summary.getByTestId(`week-${row}`).locator('.week-arrow');
  await expect(arrow('kcal')).toHaveAttribute('data-direction', 'down');
  await expect(arrow('kcal')).toContainText('lägre än veckan innan');
  await expect(arrow('protein')).toHaveAttribute('data-direction', 'up');
  await expect(arrow('vatten')).toHaveAttribute('data-direction', 'up');
  await expect(arrow('traning')).toHaveAttribute('data-direction', 'up');
  await expect(arrow('steg')).toHaveAttribute('data-direction', 'up');
  await summary.getByRole('button', { name: 'Stäng', exact: true }).tap();
  await expect(summary).toHaveCount(0);
  await page.goto('./');

  // Stäng: borta även efter omladdning.
  await card.getByRole('button', { name: 'Stäng veckosummeringen' }).tap();
  await expect(card).toHaveCount(0);
  // Vänta tills stängningen sparats innan omladdningen.
  await expect
    .poll(async () => (await dump(page)).settings.preferences)
    .toMatchObject({ weekCardDismissed: '2026-09-14' });
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
  const rows = page.getByTestId('week-list').getByTestId('week');
  await expect(rows.locator('.list-row-primary')).toHaveText(['Vecka 38', 'Vecka 37']);
  await expect(rows.first()).toContainText('loggat 6 av 7 dagar');
  // Tryck på en vecka: hela summeringen i en panel.
  await rows.first().getByRole('button').tap();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: /^Vecka 38/ })).toBeVisible();
  await expect(sheet.getByTestId('week-protein')).toContainText('110 g');
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
  await card.getByRole('link').tap();
  await page.getByTestId('week-list').getByTestId('week').first().getByRole('button').tap();
  const summary = page.getByRole('dialog');
  await expect(summary.getByTestId('week-trend')).toContainText('+');
  await expect(summary.getByTestId('week-kcal')).toHaveCount(0);
  await expect(summary.getByTestId('week-protein')).toHaveCount(0);
  await expect(summary.getByTestId('week-steg')).toHaveCount(0);
  await expect(summary.getByTestId('week-vatten')).toBeVisible();
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
  // Förklaringen om vätska och salt finns bara bakom info-knappen.
  await expect(hero).not.toContainText('vätska och salt');
  // Förändring, kvar och % räknas på trendvikten (85,72 kg, start 90, mål 80).
  await expect(page.getByTestId('hero-change')).toHaveText(/^[−-]4,3 kg$/);
  await expect(page.getByTestId('hero-remaining')).toHaveText('5,7 kg kvar');
  const progress = page.getByRole('progressbar', { name: 'Framsteg mot målvikten' });
  await expect(progress).toHaveAttribute('aria-valuenow', '43');

  // Info-knappen fäller ut en kort förklaring.
  const info = hero.getByRole('button', { name: 'Vad är trendvikt?' });
  await expect(info).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('trend-info-text')).toHaveCount(0);
  await info.tap();
  await expect(info).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('trend-info-text')).toContainText('ungefär 10 %');
  await expect(page.getByTestId('trend-info-text')).toContainText('vätska och salt');
  await info.tap();
  await expect(page.getByTestId('trend-info-text')).toHaveCount(0);

  await page.goto('./#/installningar/visning');
  const toggle = page.getByRole('switch', { name: /Visa trendvikt som huvudsiffra/ });
  await expect(toggle).toBeChecked();
  await toggle.tap();
  await expect(toggle).not.toBeChecked();
  await page.goto('./#/');
  await expect(hero.getByText('Dagsvikt', { exact: true })).toBeVisible();
  await expect(page.getByTestId('current-weight')).toHaveText('85,0 kg');
  await expect(page.getByTestId('trend-weight')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Vad är trendvikt?' })).toHaveCount(0);
  // Av: alla härledda värden räknas på dagsvikten (85,0 kg).
  await expect(page.getByTestId('hero-change')).toHaveText(/^[−-]5,0 kg$/);
  await expect(page.getByTestId('hero-remaining')).toHaveText('5,0 kg kvar');
  await expect(progress).toHaveAttribute('aria-valuenow', '50');
  // BMI finns i Framsteg → Historik, på samma vikt.
  await hero.tap();
  await expect(page.getByTestId('weight-details').getByTestId('bmi')).toHaveText('26,2');
  expect(errors).toEqual([]);
});
