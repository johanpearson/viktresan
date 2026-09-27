import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectErrors, isoDaysFromToday, seed } from './helpers.ts';

// Service workern skulle annars svara på livsmedel.json från sin cache, förbi page.route.
test.use({ serviceWorkers: 'block' });

/** Påhittade testvärden i Livsmedelsverket-formatet – inte riktiga data. */
const LIVSMEDEL = {
  format: 'viktresan-livsmedel',
  source: 'Testdatabas',
  license: 'CC BY 4.0',
  retrieved: '2026-09-01',
  extra: ['fiberG', 'sugarG', 'vitaminD', 'iron'],
  foods: [
    [1, 'Havregryn', 370, 13, 59, 7, '', [10, 1, 0, 4]],
    [2, 'Yoghurt naturell fett 3%', 60, 3.5, 4, 3, '', [0, 4, 0.1, 0]],
    [3, 'Kvarg naturell fett 0,5%', 60, 11, 3.5, 0.3, '', [0, 3.5, 0, 0]],
  ],
};

const PROFILE = {
  startDate: isoDaysFromToday(-30),
  startWeightKg: 90,
  heightCm: 180,
  goalWeightKg: 80,
  sex: 'man',
  birthYear: 1986,
  activityLevel: 'mattlig',
  ratePerWeekKg: 0.5,
  foodPreferences: 'Gillar fisk, ogillar koriander.',
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function dayMonth(iso: string): string {
  return `${String(Number(iso.slice(8, 10)))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ''}`;
}

function logEntry(id: string, foodId: string, name: string, grams: number, per100: number[]) {
  const [kcal = 0, proteinG = 0, carbsG = 0, fatG = 0] = per100;
  return {
    id,
    date: isoDaysFromToday(0),
    meal: 'frukost',
    foodId,
    name,
    amount: grams,
    unit: 'g',
    grams,
    per100: { kcal, proteinG, carbsG, fatG },
    createdAt: Date.now() - (id === 'a' ? 2000 : 1000),
  };
}

const LOG = [
  logEntry('a', 'lv:1', 'Havregryn', 60, [370, 13, 59, 7]),
  logEntry('b', 'lv:2', 'Yoghurt naturell fett 3%', 200, [60, 3.5, 4, 3]),
];

/**
 * Klipp­bordet, delningsmenyn och window.open mockas – testet ska inte lämna
 * sidan eller röra systemets urklipp. Anropen sparas på `window.__ai`.
 */
async function mockSharing(page: Page) {
  await page.addInitScript(() => {
    const calls = { copied: [] as string[], shared: [] as unknown[], opened: [] as string[] };
    Object.defineProperty(window, '__ai', { value: calls });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          calls.copied.push(text);
          return Promise.resolve();
        },
      },
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data: unknown) => {
        calls.shared.push(data);
        return Promise.resolve();
      },
    });
    window.open = (url?: string | URL) => {
      calls.opened.push(String(url));
      return null;
    };
  });
}

interface AiCalls {
  copied: string[];
  shared: { text?: string }[];
  opened: string[];
}

function aiCalls(page: Page): Promise<AiCalls> {
  return page.evaluate(() => (window as unknown as { __ai: AiCalls }).__ai);
}

async function openFood(page: Page, data: Parameters<typeof seed>[1] = {}) {
  await mockSharing(page);
  await page.route('**/livsmedel.json', (route) => route.fulfill({ json: LIVSMEDEL }));
  await page.goto('./');
  await seed(page, { profile: PROFILE, foodLog: LOG, ...data });
  await page.goto('./#/mat');
  // Läs om så att funktionsbrytarna i `settings` gäller.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mat');
  // Frukosten är utfälld bara på morgonen – fäll ut den.
  const toggle = page.getByTestId('meal-frukost').getByRole('heading').getByRole('button');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.tap();
  await expect(entry(page, 'Havregryn')).toBeVisible();
}

function entry(page: Page, name: string): Locator {
  return page.getByTestId('food-entry').filter({ hasText: name });
}

/** Sveper raden åt höger med pekarhändelser (som ett finger på mobilen). */
async function swipeRight(row: Locator) {
  const content = row.locator('.list-row-content');
  const box = await content.boundingBox();
  if (!box) throw new Error('Raden syns inte');
  const y = box.y + box.height / 2;
  const x0 = box.x + 24;
  const init = { pointerId: 8, pointerType: 'touch', isPrimary: true, button: 0, clientY: y };
  await content.dispatchEvent('pointerdown', { ...init, clientX: x0 });
  for (const f of [0.1, 0.3, 0.5]) {
    await content.dispatchEvent('pointermove', { ...init, clientX: x0 + box.width * f });
  }
  await content.dispatchEvent('pointerup', { ...init, clientX: x0 + box.width * 0.5 });
}

test('spara frukosten som egen måltid – den finns direkt under Måltider', async ({ page }) => {
  const errors = collectErrors(page);
  await openFood(page);
  await page.getByRole('button', { name: 'Fler val för frukost' }).tap();
  await page.getByRole('button', { name: 'Spara som egen måltid' }).tap();
  const name = page.getByRole('textbox', { name: 'Namn' });
  const expected = `Frukost ${dayMonth(isoDaysFromToday(0))}`;
  await expect(name).toHaveValue(expected);
  await expect(page.getByRole('dialog')).toContainText('2 ingredienser');
  await page.getByRole('button', { name: 'Spara måltid' }).tap();
  await expect(page.getByTestId('food-toast')).toContainText(`Sparade ${expected} under Måltider.`);

  await page.getByRole('button', { name: 'Sök och logga mat' }).tap();
  const picker = page.getByRole('dialog');
  await picker.getByRole('button', { name: 'Måltider' }).tap();
  const meal = picker.getByTestId('quick-pick').filter({ hasText: expected });
  await expect(meal).toBeVisible();
  // 60 g havregryn + 200 g yoghurt = 222 + 120 kcal.
  await expect(meal).toContainText('342 kcal');
  expect(errors).toEqual([]);
});

test('svep åt höger och stjärnan i redigeringen favoritmarkerar en rad', async ({ page }) => {
  const errors = collectErrors(page);
  await openFood(page);
  const row = entry(page, 'Yoghurt');
  await swipeRight(row);
  await expect(page.getByTestId('food-toast')).toContainText(
    'La till Yoghurt naturell fett 3% som favorit.',
  );
  await expect(row.getByTestId('favorite-star')).toBeVisible();

  // Stjärnan i redigerings-sheeten visar och växlar samma favorit.
  await row.getByRole('button').first().tap();
  const edit = page.getByRole('dialog', { name: 'Redigera post' });
  const star = edit.getByRole('button', { name: 'Favorit' });
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await star.tap();
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await edit.getByRole('button', { name: 'Stäng', exact: true }).tap();
  await expect(row.getByTestId('favorite-star')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('analys av måltiden och "Fråga AI" med kopiera, dela och öppna', async ({ page }) => {
  const errors = collectErrors(page);
  await openFood(page);
  await page.getByRole('button', { name: 'Fler val för frukost' }).tap();
  await page.getByRole('button', { name: 'Analysera' }).tap();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName(`Analys av frukost ${dayMonth(isoDaysFromToday(0))}`);
  const analysis = dialog.getByTestId('analysis');
  // 60 g havregryn: 6 g fiber, 2,4 mg järn; 200 g yoghurt: 0,2 µg vitamin D.
  await expect(analysis.getByTestId('nutrients-ovrigt')).toContainText('Fiber6 g');
  await expect(analysis.getByTestId('nutrients-mineral')).toContainText('Järn2,4 mg–17 %');
  await expect(analysis.getByTestId('nutrients-vitamin')).toContainText('Vitamin D0,2 µg–4 %');
  await expect(analysis.getByTestId('analysis-key-figures')).toContainText('Protein per 100 kcal');
  await expect(analysis.getByTestId('swap-suggestions')).toContainText(
    'Byt Yoghurt naturell fett 3% mot Kvarg naturell fett 0,5%: ±0 kcal, +15 g protein',
  );

  await analysis.getByRole('button', { name: 'Fråga AI' }).tap();
  const prompt = dialog.getByTestId('ai-prompt');
  await expect(prompt).toHaveValue(/förbättra min frukost/);
  await expect(prompt).toHaveValue(/Havregryn, 60 g/);
  await expect(prompt).toHaveValue(/koriander/);
  // GLP-1 är avstängd som funktion – ingen kryssruta.
  await expect(dialog.getByRole('switch', { name: /GLP-1/ })).toHaveCount(0);

  // Kryssrutorna styr innehållet och valet sparas.
  await dialog.getByRole('switch', { name: 'Matpreferenser' }).uncheck();
  await expect(prompt).not.toHaveValue(/koriander/);

  await dialog.getByRole('button', { name: 'Kopiera' }).tap();
  await expect(dialog.getByTestId('food-toast')).toContainText('Prompten är kopierad.');
  const text = await prompt.inputValue();
  expect((await aiCalls(page)).copied).toEqual([text]);

  await dialog.getByRole('button', { name: 'Dela' }).tap();
  await expect.poll(async () => (await aiCalls(page)).shared).toEqual([{ text }]);

  await dialog.getByRole('button', { name: 'Öppna i Claude' }).tap();
  await expect
    .poll(async () => (await aiCalls(page)).opened)
    .toEqual([`https://claude.ai/new?q=${encodeURIComponent(text)}`]);

  await page.reload();
  await page.getByRole('button', { name: 'Fler val för dagen' }).tap();
  await page.getByRole('button', { name: 'Analysera' }).tap();
  await page.getByRole('button', { name: 'Fråga AI' }).tap();
  await expect(page.getByRole('switch', { name: 'Matpreferenser' })).not.toBeChecked();
  await expect(page.getByTestId('ai-prompt')).toHaveValue(/förbättra min mat/);
  expect(errors).toEqual([]);
});

test('GLP-1 går att ta med när funktionen är på, men är avkryssad från början', async ({
  page,
}) => {
  await openFood(page, {
    settings: { features: { glp1: true, version: 3 } },
    medications: [
      {
        id: 'med',
        name: 'Wegovy',
        frequency: 'vecka',
        weekday: 0,
        time: '08:00',
        steps: [{ date: isoDaysFromToday(-20), doseMg: 1 }],
        createdAt: 1,
      },
    ],
  });
  await page.getByRole('button', { name: 'Fler val för frukost' }).tap();
  await page.getByRole('button', { name: 'Analysera' }).tap();
  await page.getByRole('button', { name: 'Fråga AI' }).tap();
  const glp1 = page.getByRole('switch', { name: /GLP-1/ });
  await expect(glp1).not.toBeChecked();
  await expect(page.getByTestId('ai-prompt')).not.toHaveValue(/Wegovy/);
  await glp1.check();
  await expect(page.getByTestId('ai-prompt')).toHaveValue(/GLP-1: Wegovy 1 mg per vecka/);
});

test('Fråga AI om veckan under Framsteg → Veckor', async ({ page }) => {
  await mockSharing(page);
  await page.goto('./');
  // Förra veckans måndag: dagens veckodag (0 = mån) + 7 dagar bakåt.
  const weekday = (new Date().getDay() + 6) % 7;
  const monday = isoDaysFromToday(-weekday - 7);
  const lastWeek = LOG.map((e) => ({ ...e, id: `v${e.id}`, date: monday }));
  await seed(page, { profile: PROFILE, foodLog: lastWeek });
  await page.goto('./#/framsteg/veckor');
  await page.getByTestId('week').first().getByRole('button').tap();
  await page.getByRole('button', { name: 'Fråga AI om veckan' }).tap();
  const prompt = page.getByTestId('ai-prompt');
  await expect(prompt).toHaveValue(/min mat veckan/);
  await expect(prompt).toHaveValue(/1 loggad dag/);
  await page.getByRole('button', { name: 'Kopiera' }).tap();
  expect((await aiCalls(page)).copied).toEqual([await prompt.inputValue()]);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`analysen och Fråga AI saknar tillgänglighetsfel (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await openFood(page);
    const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
    const check = async (label: string) => {
      const results = await new AxeBuilder({ page }).withTags(tags).analyze();
      const summary = results.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target.join(' ')),
      }));
      expect(summary, label).toEqual([]);
    };
    await check('Mat → Dag med meny');
    await page.getByRole('button', { name: 'Fler val för frukost' }).tap();
    await check('Menyn');
    await page.getByRole('button', { name: 'Analysera' }).tap();
    await expect(page.getByTestId('swap-suggestions')).toBeVisible();
    await check('Analys');
    if (process.env.E2E_SCREENSHOTS) {
      await page.screenshot({
        path: `${process.env.E2E_SCREENSHOTS}/analys-${colorScheme}.png`,
        fullPage: true,
      });
    }
    await page.getByRole('button', { name: 'Fråga AI' }).tap();
    await expect(page.getByTestId('ai-prompt')).toBeVisible();
    await check('Fråga AI');
    if (process.env.E2E_SCREENSHOTS) {
      await page.screenshot({
        path: `${process.env.E2E_SCREENSHOTS}/ai-${colorScheme}.png`,
        fullPage: true,
      });
    }
  });
}
