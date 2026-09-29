import { expect, test, type Page } from '@playwright/test';
import { collectErrors, dump, openLog, seed } from './helpers.ts';

/** Tiden styrs med page.clock: onsdag 2026-09-16 kl. 10:00 (lokal tid). */
const TODAY = '2026-09-16';

const PROFILE = {
  startDate: '2026-09-01',
  startWeightKg: 100,
  heightCm: 180,
  goalWeightKg: 85,
  sex: 'man',
  birthYear: 1980,
  activityLevel: 'latt',
};

const food = (id: string, foodId: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  date: TODAY,
  meal: 'frukost',
  foodId,
  name,
  amount: 100,
  unit: 'g',
  grams: 100,
  per100: { kcal: 300, proteinG: 10, carbsG: 50, fatG: 5 },
  createdAt: 1,
  ...extra,
});

/** En Open Food Facts-produkt med fiber (10 g/100 g) och en snabblogg utan fiberdata. */
const DATA = {
  profile: PROFILE,
  foods: [
    {
      id: 'off:7310130000000',
      name: 'Fullkornsmüsli',
      source: 'openfoodfacts',
      per100: { kcal: 300, proteinG: 10, carbsG: 50, fatG: 5 },
      fiberG: 10,
      ean: '7310130000000',
      createdAt: 1,
    },
  ],
  foodLog: [
    food('f1', 'off:7310130000000', 'Fullkornsmüsli'),
    food('f2', 'snabb:Lunch ute:700:0', 'Lunch ute', {
      estimated: true,
      per100: { kcal: 700, proteinG: 0, carbsG: 0, fatG: 0 },
    }),
  ],
};

function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Huvudmeny' });
}

async function start(page: Page) {
  await page.clock.setFixedTime(new Date(`${TODAY}T10:00:00`));
  await page.goto('./');
  await seed(page, DATA);
  await page.reload();
  await expect(page.getByTestId('today-card')).toBeVisible();
}

test('GLP-1 på: fiberring med upptrappning, höjt dryckesmål och påminnelse vid diarré', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await start(page);

  // GLP-1 av: ingen fiberring, standardmålet för dryck.
  await expect(page.getByTestId('fiber-ring')).toHaveCount(0);
  await expect(page.getByTestId('water-ring')).toHaveAttribute(
    'aria-valuetext',
    '0 ml av 2 000 ml',
  );
  await expect(page.getByTestId('hydration-reminder')).toHaveCount(0);

  // Slå på GLP-1 under Inställningar → Funktioner.
  await page.goto('./#/installningar/funktioner');
  await page.getByRole('switch', { name: /^GLP-1/ }).setChecked(true);
  await page.goto('./');

  // Fiberring bredvid kalorier och protein: 10 g av veckans mål 15 g (ingen fiberhistorik).
  const fiberRing = page.getByTestId('fiber-ring');
  await expect(fiberRing).toHaveAttribute('aria-valuetext', '10 g av 15 g');
  await expect(page.getByTestId('kcal-ring')).toBeVisible();
  await expect(page.getByTestId('protein-ring')).toBeVisible();
  // Fyra ringar ryms på en rad.
  const rings = await page.locator('.rings .goal-ring').all();
  expect(rings).toHaveLength(4);
  const tops = await Promise.all(rings.map(async (r) => (await r.boundingBox())?.y));
  expect(new Set(tops).size).toBe(1);

  // Dryckesmålet +500 ml med en kort förklaring.
  await expect(page.getByTestId('water-ring')).toHaveAttribute(
    'aria-valuetext',
    '0 ml av 2 500 ml',
  );
  // Förklaringen står i dryckespanelen (tryck på ringen).
  await page.getByRole('button', { name: 'Dryck – logga dryck' }).tap();
  await expect(page.getByRole('dialog').getByTestId('drink-note')).toContainText(
    '+500 ml med GLP-1',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Stäng', exact: true }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Fiberringen → Mat → Näring: veckans mål och notisen om saknad fiberdata (snabbloggen).
  await page.getByRole('link', { name: 'Fiber – visa näring' }).tap();
  await expect(page.getByTestId('fiber-week-goal')).toHaveText(
    'Veckans fibermål: 15 g (mål 35 g).',
  );
  await expect(page.getByTestId('fiber-incomplete')).toContainText(
    'Dagens fiber kan vara i underkant',
  );
  await expect(page.getByTestId('nutrition-fiber')).toContainText('10');
  await page.goBack();
  await expect(page.getByTestId('fiber-ring')).toBeVisible();

  // Upptrappningens start sparas i profilen.
  await expect
    .poll(
      async () =>
        ((await dump(page)).profile as { fiberRampStart?: unknown } | null)?.fiberRampStart,
    )
    .toEqual({ date: TODAY, startG: 15 });

  // Mat → Dag: fiberstapeln i toppen.
  await nav(page).getByRole('link', { name: 'Mat' }).tap();
  await expect(page.getByTestId('fiber-intake')).toHaveText('10 / 15 g fiber');

  // Logga diarré → saklig påminnelse på Översikt, målet höjs inte mer.
  await nav(page).getByRole('link', { name: 'Logga' }).tap();
  await openLog(page, 'glp1');
  const sheet = page.getByRole('dialog', { name: 'GLP-1' });
  await sheet.getByRole('button', { name: 'Mående', exact: true }).tap();
  await sheet.getByRole('button', { name: 'Diarré' }).tap();
  await sheet.getByRole('button', { name: 'Spara mående' }).tap();
  await expect(sheet.getByRole('status')).toHaveText(/Sparade måendet/);
  await sheet.getByRole('button', { name: 'Stäng' }).tap();
  await nav(page).getByRole('link', { name: 'Översikt' }).tap();
  const reminder = page.getByTestId('hydration-reminder');
  await expect(reminder).toContainText('Drick lite extra idag');
  await expect(reminder).toContainText('Du har loggat diarré idag.');
  await expect(page.getByTestId('water-ring')).toHaveAttribute(
    'aria-valuetext',
    '0 ml av 2 500 ml',
  );

  expect(errors).toEqual([]);
});

test('fibermål utan GLP-1, direkt på referensvärdet, och eget dryckesmål', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);

  // Visa fibermål utan GLP-1 och stäng av upptrappningen.
  await page.goto('./#/installningar/fiber');
  const sheet = page.getByRole('dialog', { name: 'Fibermål' });
  await sheet.getByRole('switch', { name: 'Visa fibermål' }).setChecked(true);
  await expect(sheet.getByTestId('fiber-goal-status')).toHaveText(
    'Veckans fibermål: 15 g (mål 35 g).',
  );
  await sheet.getByRole('switch', { name: 'Gradvis upptrappning' }).setChecked(false);
  await expect(sheet.getByTestId('fiber-goal-status')).toHaveText('Fibermål: 35 g per dag.');
  await sheet.getByRole('button', { name: 'Stäng' }).tap();

  await page.goto('./');
  await expect(page.getByTestId('fiber-ring')).toHaveAttribute('aria-valuetext', '10 g av 35 g');
  await expect(page.getByTestId('fiber-week-goal')).toHaveCount(0);
  // Utan GLP-1 ingen höjning av dryckesmålet.
  await expect(page.getByTestId('water-ring')).toHaveAttribute(
    'aria-valuetext',
    '0 ml av 2 000 ml',
  );

  // Med GLP-1 och eget mål: tillägget läggs bara ovanpå om användaren väljer det.
  await page.goto('./#/installningar/funktioner');
  await page.getByRole('switch', { name: /^GLP-1/ }).setChecked(true);
  await page.goto('./#/installningar/dryck');
  const drink = page.getByRole('dialog', { name: 'Dryckesmål' });
  await drink.getByLabel('Eget mål (ml, valfritt)').fill('2400');
  await drink.getByRole('button', { name: 'Spara dryckesmål' }).tap();
  await expect(drink.getByRole('status')).toHaveText('Dryckesmålet är 2 400 ml per dag.');
  await drink
    .getByRole('switch', { name: 'Lägg GLP-1-tillägget på mitt eget mål' })
    .setChecked(true);
  await drink.getByLabel('Tillägg med GLP-1').selectOption('300');
  await drink.getByRole('button', { name: 'Spara dryckesmål' }).tap();
  await expect(drink.getByRole('status')).toHaveText(
    'Dryckesmålet är 2 700 ml per dag (varav 300 ml för GLP-1).',
  );

  const stored = await dump(page);
  expect(stored.profile).toMatchObject({
    showFiberGoal: true,
    fiberRamp: false,
    waterGoalMl: 2400,
    waterGlp1BonusMl: 300,
    waterGlp1OnOwnGoal: true,
  });
  expect(errors).toEqual([]);
});
