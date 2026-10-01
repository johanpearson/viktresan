import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, seed, type SeedData } from './helpers.ts';

/**
 * Mat → Dag: gapraden under kcal-stapeln, "Vad ska jag äta?" (prompten) och filterchipsen i
 * sök-sheeten. Fast tid: torsdag 2026-09-24 kl. 12:30 (lunch). Påhittade testvärden – inte riktiga data.
 */

test.use({ locale: 'sv-SE', timezoneId: 'Europe/Stockholm', serviceWorkers: 'block' });

const TODAY = '2026-09-24';
const NOW = '2026-09-24T12:30:00+02:00';

const LIVSMEDEL = {
  format: 'viktresan-livsmedel',
  source: 'Testdatabas',
  license: 'CC BY 4.0',
  retrieved: '2026-09-01',
  extra: ['fiberG'],
  foods: [
    [1, 'Kycklingfilé', 110, 23, 0, 2, '', [0]],
    [2, 'Havregryn', 370, 13, 59, 7, '', [10]],
    [3, 'Linser kokta', 110, 9, 16, 0.5, '', [8]],
  ],
};

const FOODS: Record<number, { name: string; per100: Record<string, number> }> = {};
for (const [id, name, kcal, proteinG, carbsG, fatG] of LIVSMEDEL.foods as [
  number,
  string,
  number,
  number,
  number,
  number,
][]) {
  FOODS[id] = { name, per100: { kcal, proteinG, carbsG, fatG } };
}

function daysAgo(days: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

let seq = 0;
function logged(nummer: number, date: string, meal: string, grams: number) {
  seq += 1;
  const food = FOODS[nummer];
  if (!food) throw new Error(`lv:${String(nummer)}`);
  return {
    id: `e${String(seq)}`,
    date,
    meal,
    foodId: `lv:${String(nummer)}`,
    name: food.name,
    per100: food.per100,
    amount: grams,
    unit: 'g',
    grams,
    createdAt: Date.parse(`${date}T10:00:00Z`) + seq,
  };
}

/** Proteinmål 1,6 × 80 = 128 g; fiber utan fibermål: referensvärdet 25 g (kvinna). */
const PROFILE = {
  startDate: daysAgo(60),
  startWeightKg: 92,
  heightCm: 178,
  goalWeightKg: 80,
  sex: 'kvinna',
  birthYear: 1985,
  activityLevel: 'latt',
  ratePerWeekKg: 0.5,
  foodPreferences: 'Gillar fisk, äter inte fläsk.',
};

const WEIGHTS = [30, 20, 10, 2].map((days, i) => ({
  id: `w${String(i)}`,
  date: daysAgo(days),
  weightKg: 90 - i * 0.5,
  createdAt: Date.parse(`${daysAgo(days)}T07:00:00Z`),
}));

/** Tre dagars lunch à 440 kcal (typisk portion) och havregryn till frukost. */
const HISTORY = [1, 2, 3].flatMap((d) => [
  logged(1, daysAgo(d), 'lunch', 400),
  logged(2, daysAgo(d), 'frukost', 60),
]);

/**
 * Idag: 60 g havregryn (7,8 g protein, 6 g fiber) + 200 g kyckling (46 g protein) = 442 kcal.
 * Kvar: 74 g protein (58 %) och 19 g fiber (76 %) – fibern först.
 */
const TODAYS_GAPS = [logged(2, TODAY, 'frukost', 60), logged(1, TODAY, 'lunch', 200)];

/** Idag med målen nära: 132 g protein (mål 128 g), 24 g fiber (mål 25 g – 4 % kvar). */
const TODAYS_DONE = [
  logged(2, TODAY, 'frukost', 60),
  logged(1, TODAY, 'lunch', 450),
  logged(3, TODAY, 'middag', 225),
];

async function open(page: Page, foodLog: Record<string, unknown>[]) {
  await page.clock.setFixedTime(new Date(NOW));
  await page.addInitScript(() => {
    const calls = { copied: [] as string[], shared: [] as { text?: string }[] };
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
      value: (data: { text?: string }) => {
        calls.shared.push(data);
        return Promise.resolve();
      },
    });
  });
  await page.route('**/livsmedel.json', (route) => route.fulfill({ json: LIVSMEDEL }));
  await page.route('**/fineli.json', (route) =>
    route.fulfill({ json: { format: 'viktresan-livsmedel', foods: [] } }),
  );
  await page.goto('./');
  const data: SeedData = { profile: PROFILE, weights: WEIGHTS, foodLog };
  await seed(page, data);
  await page.goto('./#/mat');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Mat' })).toBeVisible();
}

function aiCalls(page: Page): Promise<{ copied: string[]; shared: { text?: string }[] }> {
  return page.evaluate(
    () => (window as unknown as { __ai: { copied: string[]; shared: { text?: string }[] } }).__ai,
  );
}

/** "1 234 kcal kvar" i kcal-stapeln → "1 234 kcal". */
async function remainingKcal(page: Page): Promise<string> {
  const text = (await page.getByTestId('remaining-kcal').first().textContent()) ?? '';
  return text.replace(/ kvar$/, '');
}

test('gapraden visar protein och fiber kvar; sökningen visar deras chips först utan att förvälja', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await open(page, [...HISTORY, ...TODAYS_GAPS]);
  const summary = page.getByRole('region', { name: 'Dagens summering' });
  await expect(summary.getByTestId('gap-line')).toHaveText('19 g fiber och 74 g protein kvar');

  await page.getByRole('button', { name: 'Sök och logga mat' }).tap();
  const picker = page.getByRole('dialog', { name: 'Logga mat' });
  const chips = picker.getByRole('group', { name: 'Filtrera på etikett' }).getByRole('button');
  await expect(chips).toHaveText(['Fiberrik', 'Proteinrik', 'Energisnål']);
  for (const chip of await chips.all()) await expect(chip).toHaveAttribute('aria-pressed', 'false');

  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(a11y.violations).toEqual([]);
  expect(errors).toEqual([]);
});

test('gapraden döljs när allt är inom 10 % av målet och för andra dagar än idag', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await open(page, [...HISTORY, ...TODAYS_DONE]);
  const summary = page.getByRole('region', { name: 'Dagens summering' });
  // Vänta tills fiberdatan är läst (dagens fiber i makroraden) innan gapraden bedöms.
  await expect(summary.getByTestId('macros')).toContainText('24 g');
  await expect(summary.getByTestId('gap-line')).toHaveCount(0);
  await expect(summary.getByRole('button', { name: 'Vad ska jag äta?' })).toBeVisible();

  // Utan stora gap: chipsen i vanlig ordning.
  await page.getByRole('button', { name: 'Sök och logga mat' }).tap();
  const picker = page.getByRole('dialog', { name: 'Logga mat' });
  await expect(
    picker.getByRole('group', { name: 'Filtrera på etikett' }).getByRole('button'),
  ).toHaveText(['Proteinrik', 'Fiberrik', 'Energisnål']);
  await picker.getByRole('button', { name: 'Stäng', exact: true }).tap();
  await expect(picker).toHaveCount(0);

  // Igår (bara lunch och frukost loggade): inget "kvar" och ingen knapp för en annan dag.
  await page.getByRole('button', { name: 'Föregående dag' }).tap();
  await expect(summary.getByTestId('intake')).toContainText('662');
  await expect(summary.getByTestId('gap-line')).toHaveCount(0);
  await expect(summary.getByRole('button', { name: 'Vad ska jag äta?' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('"Vad ska jag äta?" bygger prompten för pågående måltid och måltiden i ⋯-menyn', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await open(page, [...HISTORY, ...TODAYS_GAPS]);
  const kcal = await remainingKcal(page);

  // Toppen: pågående måltid enligt klockslaget (12:30 = lunch).
  await page.getByRole('button', { name: 'Vad ska jag äta?' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Vad ska jag äta till lunch?' });
  await expect(sheet).toBeVisible();
  const prompt = sheet.getByTestId('ai-prompt');
  await expect(prompt).toHaveValue(/vad jag ska äta till lunch idag/);
  const text = await prompt.inputValue();
  expect(text).toContain('Måltid: Lunch, min typiska portion är ca 440 kcal.');
  expect(text).toContain(`Kvar av dagens mål: ${kcal}, 74 g protein, 19 g fiber.`);
  // Lika många loggar: senast loggat först (frukosten loggas efter lunchen i testdatan).
  expect(text).toContain('Det här brukar finnas hemma: Havregryn, Kycklingfilé.');
  expect(text).toContain('Mina matpreferenser: Gillar fisk, äter inte fläsk.');
  expect(text).toContain('3 realistiska förslag som passar måltiden');

  // Dela och Kopiera skickar exakt prompten.
  await sheet.getByRole('button', { name: 'Dela' }).tap();
  await sheet.getByRole('button', { name: 'Kopiera' }).tap();
  await expect(sheet.getByTestId('food-toast')).toContainText('Prompten är kopierad.');
  const calls = await aiCalls(page);
  expect(calls.shared).toEqual([{ text }]);
  expect(calls.copied).toEqual([text]);

  // Samma kryssrutor som "Fråga AI": matpreferenserna kan väljas bort.
  await sheet.getByRole('switch', { name: 'Matpreferenser' }).uncheck();
  await expect(prompt).not.toHaveValue(/Mina matpreferenser/);
  await sheet.getByRole('switch', { name: 'Matpreferenser' }).check();
  await sheet.getByRole('button', { name: 'Stäng', exact: true }).first().tap();
  await expect(sheet).toHaveCount(0);

  // ⋯ på den tomma middagen: vald måltid, utan historik ingen typisk portion.
  await page.getByRole('button', { name: 'Fler val för middag' }).tap();
  await page
    .getByRole('dialog', { name: 'Middag' })
    .getByRole('button', { name: /Vad ska jag äta\?/ })
    .tap();
  const dinner = page.getByRole('dialog', { name: 'Vad ska jag äta till middag?' });
  await expect(dinner.getByTestId('ai-prompt')).toHaveValue(/Måltid: Middag\.\n/);
  await expect(dinner.getByTestId('ai-prompt')).toHaveValue(
    new RegExp(`Kvar av dagens mål: ${kcal}, 74 g protein, 19 g fiber\\.`),
  );

  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(a11y.violations).toEqual([]);
  expect(errors).toEqual([]);
});
