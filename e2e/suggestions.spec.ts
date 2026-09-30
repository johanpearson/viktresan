import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectErrors, dump, seed, type SeedData } from './helpers.ts';
import { LIVSMEDEL } from './visualData.ts';

/**
 * Mat → Föreslå med fast testhistorik: torsdag 2026-09-24 kl. 15:30 (mellanmål). Livsmedlen är
 * den påhittade testdatabasen i visualData.ts (Fineli tom), så startlistans livsmedel använder
 * sina egna reservvärden.
 */

test.use({ locale: 'sv-SE', timezoneId: 'Europe/Stockholm', serviceWorkers: 'block' });

const TODAY = '2026-09-24';
const NOW = '2026-09-24T15:30:00+02:00';

function daysAgo(days: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Id och värden per 100 g ur testdatabasen (LIVSMEDEL). */
function lv(nummer: number) {
  const row = LIVSMEDEL.foods.find((f) => f[0] === nummer);
  if (!row) throw new Error(`lv:${String(nummer)}`);
  const [, name, kcal, proteinG, carbsG, fatG] = row as [
    number,
    string,
    number,
    number,
    number,
    number,
  ];
  return { foodId: `lv:${String(nummer)}`, name, per100: { kcal, proteinG, carbsG, fatG } };
}

let seq = 0;
function logged(
  nummer: number,
  date: string,
  meal: string,
  grams: number,
  unit = 'g',
  amount = grams,
) {
  seq += 1;
  return {
    id: `h${String(seq)}`,
    date,
    meal,
    ...lv(nummer),
    amount,
    unit,
    grams,
    createdAt: Date.parse(`${date}T12:00:00Z`) + seq,
  };
}

const PROFILE = {
  startDate: daysAgo(60),
  startWeightKg: 92,
  heightCm: 178,
  goalWeightKg: 80,
  sex: 'kvinna',
  birthYear: 1985,
  activityLevel: 'latt',
  ratePerWeekKg: 0.5,
};

const WEIGHTS = [30, 20, 10, 2].map((days, i) => ({
  id: `w${String(i)}`,
  date: daysAgo(days),
  weightKg: 90 - i * 0.5,
  createdAt: Date.parse(`${daysAgo(days)}T07:00:00Z`),
}));

/** Tre veckors historik: kvarg och banan som mellanmål, gröt till frukost, kyckling till lunch. */
const HISTORY = Array.from({ length: 20 }, (_, i) => i + 1).flatMap((d) => [
  logged(1, daysAgo(d), 'frukost', 60),
  logged(2, daysAgo(d), 'frukost', 200, 'dl', 2),
  logged(7, daysAgo(d), 'mellanmal', 150),
  ...(d % 2 === 0 ? [logged(3, daysAgo(d), 'mellanmal', 120, 'st', 1)] : []),
  logged(6, daysAgo(d), 'lunch', 150),
  logged(4, daysAgo(d), 'lunch', 200),
]);

/** Idag: frukost och lunch är loggade, mellanmålet är tomt. */
const TODAYS = [
  logged(1, TODAY, 'frukost', 60),
  logged(2, TODAY, 'frukost', 200, 'dl', 2),
  logged(6, TODAY, 'lunch', 150),
  logged(4, TODAY, 'lunch', 200),
];

const DATA: SeedData = { profile: PROFILE, weights: WEIGHTS, foodLog: [...HISTORY, ...TODAYS] };

async function open(page: Page, data: SeedData = DATA) {
  await page.clock.setFixedTime(new Date(NOW));
  await page.route('**/livsmedel.json', (route) => route.fulfill({ json: LIVSMEDEL }));
  await page.route('**/fineli.json', (route) =>
    route.fulfill({ json: { format: 'viktresan-livsmedel', foods: [] } }),
  );
  await page.goto('./');
  await seed(page, data);
  await page.goto('./#/mat');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Mat' })).toBeVisible();
}

function sheet(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Föreslå' });
}

async function remainingKcal(page: Page): Promise<number> {
  const value = await sheet(page).getByTestId('suggest-status').getAttribute('data-remaining-kcal');
  return Number(value);
}

test('Föreslå för mellanmål: förslag under kvarvarande kcal, logga och ångra', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);

  await page.getByRole('button', { name: 'Föreslå' }).tap();
  const panel = sheet(page);
  await expect(panel).toBeVisible();
  // Pågående måltid enligt klockslaget (15:30 = mellanmål).
  await expect(panel.getByRole('button', { name: 'Mellanmål' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(panel.getByTestId('suggest-status')).toHaveAttribute('data-mode', 'normal');
  // Rubriken bygger på dagens största gap: fiber (9 av 25 g) och protein (64 av 128 g).
  await expect(panel.getByTestId('suggest-status')).toHaveText(
    /^\d+ g fiber och \d+ g protein kvar · [\d  ]+ kcal kvar$/,
  );

  const remaining = await remainingKcal(page);
  expect(remaining).toBeGreaterThan(150);
  const items = panel.getByTestId('suggestion');
  await expect(items.first()).toBeVisible();
  const count = await items.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(3);
  for (const item of await items.all()) {
    expect(Number(await item.getAttribute('data-kcal'))).toBeLessThanOrEqual(remaining);
  }
  // Näringsgapet styr: det första förslaget fyller fibergapet och säger varför.
  await expect(items.first().getByTestId('suggestion-reason')).toHaveText(/fiber/);
  await expect(items.first().getByTestId('suggestion-effect')).toContainText('kvar efteråt');
  // Vanan väger högst 20 %: startlistans chiapudding, sojabönor och tonfisk fyller gapen bättre
  // än kvargen som loggas varje dag.
  await expect(panel.locator('[data-key="lv:7"]')).toHaveCount(0);

  // Logga det första förslaget direkt i mellanmålet.
  const name = (await items.first().getByTestId('suggestion-name').textContent()) ?? '';
  const key = (await items.first().getAttribute('data-key')) ?? '';
  const before = (await dump(page)).foodLog.length;
  await items
    .first()
    .getByRole('button', { name: /^Logga / })
    .tap();
  const toast = panel.getByTestId('suggest-toast');
  await expect(toast).toContainText(`Loggade ${name} till mellanmål.`);
  const afterLog = (await dump(page)).foodLog as { meal: string; date: string }[];
  expect(afterLog.length).toBeGreaterThan(before);
  expect(afterLog.filter((e) => e.date === TODAY && e.meal === 'mellanmal').length).toBe(
    afterLog.length - before,
  );
  // Det loggade föreslås inte igen, och det som är kvar har minskat.
  await expect(panel.locator(`[data-key="${key}"]`)).toHaveCount(0);
  expect(await remainingKcal(page)).toBeLessThan(remaining);

  // Ångra tar bort det som loggades.
  await toast.getByRole('button', { name: 'Ångra' }).tap();
  await expect(toast).toContainText('Ångrade');
  await expect.poll(async () => (await dump(page)).foodLog.length).toBe(before);
  expect(await remainingKcal(page)).toBe(remaining);

  await panel.getByRole('button', { name: 'Stäng', exact: true }).first().tap();
  await expect(panel).toBeHidden();
  await expect(page.getByTestId('meal-mellanmal')).toHaveAttribute('data-expanded', 'false');
  expect(errors).toEqual([]);
});

test('måltidens ⋯ öppnar Föreslå för måltiden, även när den är tom', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Fler val för middag' }).tap();
  const menu = page.getByRole('dialog', { name: 'Middag' });
  // Tom måltid: bara Föreslå i menyn.
  await expect(menu.getByRole('button', { name: /Analysera/ })).toHaveCount(0);
  await menu.getByRole('button', { name: /^Föreslå/ }).tap();
  const panel = sheet(page);
  await expect(panel.getByRole('button', { name: 'Middag' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Byt måltid i sheeten.
  await panel.getByRole('button', { name: 'Frukost' }).tap();
  await expect(panel.getByRole('button', { name: 'Frukost' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(panel.getByTestId('suggestion').first()).toBeVisible();
});

test('Justera öppnar logg-sheeten förifylld med förslagets mängd och måltid', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Föreslå' }).tap();
  // Kycklingen (150 g till lunch) är en proteinkälla: skalad mot mellanmålets typiska kcal, men
  // aldrig under 75 g.
  await sheet(page).getByRole('button', { name: 'Visa fler' }).tap();
  const kyckling = sheet(page).locator('[data-key="lv:6"]');
  await expect(kyckling.getByTestId('suggestion-reason')).toHaveText('Mycket protein per kcal');
  const amount = (await kyckling.locator('.suggest-amount').textContent()) ?? '';
  const grams = /^(\d+) g$/.exec(amount)?.[1] ?? '';
  expect(Number(grams)).toBeGreaterThanOrEqual(75);
  expect(Number(grams)).toBeLessThanOrEqual(300);
  await kyckling.getByRole('button', { name: /^Justera / }).tap();
  const form = page.getByTestId('food-log-form');
  await expect(form).toBeVisible();
  await expect(form.getByLabel('Måltid')).toHaveValue('mellanmal');
  await expect(form.getByLabel(/Mängd/)).toHaveValue(grams);
  await form.getByLabel(/Mängd/).fill('100');
  await form.getByRole('button', { name: 'Logga', exact: true }).tap();
  await expect(sheet(page).getByTestId('suggest-toast')).toContainText('100 g');
});

test('tom historik: tre allmänna startförslag inom budgeten', async ({ page }) => {
  await open(page, { profile: PROFILE, weights: WEIGHTS, foodLog: TODAYS });
  await page.getByRole('button', { name: 'Föreslå' }).tap();
  const panel = sheet(page);
  const items = panel.getByTestId('suggestion');
  await expect(items).toHaveCount(3);
  const remaining = await remainingKcal(page);
  for (const item of await items.all()) {
    await expect(item.getByTestId('general-tag')).toHaveText('Allmänt förslag');
    expect(Number(await item.getAttribute('data-kcal'))).toBeLessThanOrEqual(remaining);
  }
  // Visa fler visar nästa tre.
  await panel.getByRole('button', { name: 'Visa fler' }).tap();
  await expect(items).toHaveCount(6);
});

test('"Inte intresserad" döljer förslaget, och det kan visas igen i inställningarna', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: 'Föreslå' }).tap();
  const panel = sheet(page);
  const first = panel.getByTestId('suggestion').first();
  const key = (await first.getAttribute('data-key')) ?? '';
  const name = (await first.getByTestId('suggestion-name').textContent()) ?? '';
  await first.getByRole('button', { name: /^Inte intresserad/ }).tap();
  await expect(panel.getByTestId('suggest-toast')).toContainText(`Visar inte ${name}`);
  await expect(panel.locator(`[data-key="${key}"]`)).toHaveCount(0);

  // Ångra visar det igen; dölj det på nytt.
  await panel.getByTestId('suggest-toast').getByRole('button', { name: 'Ångra' }).tap();
  await expect(panel.locator(`[data-key="${key}"]`)).toHaveCount(1);
  await panel
    .locator(`[data-key="${key}"]`)
    .getByRole('button', { name: /^Inte intresserad/ })
    .tap();
  await expect(panel.locator(`[data-key="${key}"]`)).toHaveCount(0);

  // Även efter omladdning.
  await page.reload();
  await page.getByRole('button', { name: 'Föreslå' }).tap();
  await expect(sheet(page).getByTestId('suggestion').first()).toBeVisible();
  await expect(sheet(page).locator(`[data-key="${key}"]`)).toHaveCount(0);

  // Inställningar → Visning: visa alla igen.
  await page.goto('./#/installningar/visning');
  await expect(page.getByTestId('suggestions-hidden')).toContainText('1 förslag är dolt');
  await page.getByRole('button', { name: 'Visa alla förslag igen' }).tap();
  await expect(page.getByTestId('suggestions-hidden-none')).toBeVisible();
});

test('nått dagens mål: bara energisnåla alternativ och en saklig rad', async ({ page }) => {
  // En stor middag igår kväll … och idag: lunch som tar hela dagens mål.
  const big = Array.from({ length: 12 }, () => logged(6, TODAY, 'lunch', 150));
  await open(page, {
    profile: PROFILE,
    weights: WEIGHTS,
    foodLog: [...HISTORY, ...TODAYS, ...big],
  });
  await page.getByRole('button', { name: 'Föreslå' }).tap();
  const panel = sheet(page);
  await expect(panel.getByTestId('suggest-status')).toHaveText(
    'Du har nått dagens mål. Är du hungrig finns lätta alternativ här.',
  );
  await expect(panel.getByTestId('suggest-status')).toHaveAttribute('data-mode', 'low');
  const items = panel.getByTestId('suggestion');
  await expect(items.first()).toBeVisible();
  for (const item of await items.all()) {
    await expect(item.getByTestId('low-energy')).toBeVisible();
  }
  await expect(panel).not.toContainText('protein idag');
});

test('Något nytt bygger en AI-prompt med det som är kvar och det som brukar finnas hemma', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: 'Föreslå' }).tap();
  await sheet(page).getByRole('button', { name: 'Något nytt' }).tap();
  const ai = page.getByRole('dialog', { name: 'Något nytt till mellanmål' });
  const prompt = ai.getByTestId('ai-prompt');
  await expect(prompt).toHaveValue(/nya idéer till mellanmål idag/);
  await expect(prompt).toHaveValue(/Kvar av dagens mål: [\d  ]+ kcal/);
  await expect(prompt).toHaveValue(/Det här brukar finnas hemma: .*Kvarg naturell/);
  await expect(ai.getByRole('button', { name: 'Kopiera' })).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`Föreslå-panelen har inga tillgänglighetsfel (axe, ${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await open(page);
    await page.getByRole('button', { name: 'Föreslå' }).tap();
    await expect(sheet(page).getByTestId('suggestion').first()).toBeVisible();
    // Vänta tills panelens öppningsanimation är klar (full kontrast).
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();
    expect(
      results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) })),
    ).toEqual([]);
  });
}
