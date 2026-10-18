import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectErrors, dump, isoDaysFromToday, seed, swipeLeft } from './helpers.ts';

// Service workern skulle annars svara på livsmedel.json från sin cache, förbi page.route.
test.use({ serviceWorkers: 'block' });

/** Påhittade testvärden i Livsmedelsverket-formatet – inte riktiga data. */
const LIVSMEDEL = {
  format: 'viktresan-livsmedel',
  source: 'Testdatabas',
  license: 'CC BY 4.0',
  retrieved: '2026-09-01',
  foods: [
    [1, 'Havregryn', 370, 13, 59, 7],
    [4, 'Potatis kokt', 80, 2, 17, 0.1],
  ],
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

/** Linsgryta: 4 portioner à 300 g, 400 kcal per portion. */
const STEW = {
  id: 'linsgryta',
  name: 'Linsgryta',
  items: [
    {
      foodId: 'lv:4',
      name: 'Potatis kokt',
      amount: 2000,
      unit: 'g',
      grams: 2000,
      per100: { kcal: 80, proteinG: 2, carbsG: 17, fatG: 0.1 },
    },
  ],
  servings: 4,
  cookedWeightG: 1200,
  createdAt: Date.now() - 86_400_000,
};

async function openFood(page: Page, data: Record<string, unknown> = {}) {
  await page.route('**/livsmedel.json', (route) => route.fulfill({ json: LIVSMEDEL }));
  await page.route('**/fineli.json', (route) =>
    route.fulfill({ json: { format: 'viktresan-livsmedel', foods: [] } }),
  );
  await page.goto('./');
  await seed(page, { profile: PROFILE, ...data });
  await page.goto('./#/mat');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mat');
}

function sheet(page: Page): Locator {
  return page.getByRole('dialog').last();
}

function form(page: Page): Locator {
  return page.getByTestId('food-log-form');
}

async function chooseUnit(page: Page, unit: string) {
  const chip = form(page)
    .getByRole('group', { name: 'Enhet' })
    .getByRole('button', { name: unit, exact: true });
  await chip.tap();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
}

test('enheter: bråk, omräkning vid enhetsbyte och tryck på en omräkning', async ({ page }) => {
  const errors = collectErrors(page);
  await openFood(page);
  await page.getByRole('button', { name: 'Sök och logga mat' }).tap();
  await sheet(page).getByLabel('Sök livsmedel').fill('havregryn');
  await sheet(page).getByTestId('search-result').filter({ hasText: 'Havregryn' }).first().tap();

  // 1 dl havregryn ≈ 35 g; mängden får skrivas som bråk.
  const preview = page.getByTestId('log-preview');
  await expect(form(page).getByLabel('Mängd (dl)')).toHaveValue('1');
  await form(page).getByLabel('Mängd (dl)').fill('1 1/2');
  await expect(preview).toHaveText('1,5 dl ≈ 52,5 g · 194 kcal');

  // Byte till gram behåller vikten (avrundad till hela gram).
  await chooseUnit(page, 'g');
  await expect(form(page).getByLabel('Mängd (g)')).toHaveValue('53');

  // 150 g → dl: 4,29 dl avrundas till 4,5 dl (inte "1 dl" som förut).
  await form(page).getByLabel('Mängd (g)').fill('150');
  await chooseUnit(page, 'dl');
  await expect(form(page).getByLabel('Mängd (dl)')).toHaveValue('4,5');

  // Omräkningen visar samma mängd i andra enheter; tryck byter till den.
  await form(page).getByLabel('Mängd (dl)').fill('1');
  const same = page.getByTestId('unit-equivalents');
  await expect(same.getByRole('button')).toHaveText(['6,5 msk', '35 g']);
  await same.getByRole('button', { name: 'Byt till 6,5 msk' }).tap();
  await expect(form(page).getByLabel('Mängd (msk)')).toHaveValue('6,5');
  await expect(preview).toHaveText('6,5 msk ≈ 34,4 g · 127 kcal');

  await form(page).getByRole('button', { name: 'Logga', exact: true }).tap();
  await expect(form(page)).toBeHidden();
  const stored = await dump(page);
  expect(stored.foodLog).toEqual([
    expect.objectContaining({ foodId: 'lv:1', amount: 6.5, unit: 'msk', grams: 34.4 }),
  ]);
  expect(errors).toEqual([]);
});

test('matlådor: resten av ett recept loggas portion för portion och kan markeras som slut', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openFood(page, { recipes: [STEW] });
  await page.getByRole('button', { name: 'Sök och logga mat' }).tap();
  await sheet(page).getByRole('button', { name: 'Måltider', exact: true }).tap();
  await sheet(page).getByTestId('quick-pick').filter({ hasText: 'Linsgryta' }).tap();

  // Första portionen: "Resten blir matlådor" är på.
  const offer = page.getByTestId('batch-offer');
  await expect(offer).toContainText('3 portioner kvar');
  await expect(offer.getByRole('switch')).toBeChecked();
  await form(page).getByRole('button', { name: 'Logga', exact: true }).tap();
  await expect(form(page)).toBeHidden();

  // Matlådorna överst i sök-sheeten.
  const box = sheet(page).getByTestId('leftover');
  await expect(box).toHaveCount(1);
  await expect(box).toContainText('Linsgryta');
  await expect(box).toContainText('3 portioner kvar · lagad idag');
  await expect(box).toContainText('400 kcal');

  // En matlåda: 1 portion förvald, ingen ny omgång.
  await box.getByRole('button').tap();
  await expect(form(page).getByLabel('Mängd (portion)')).toHaveValue('1');
  await expect(offer).toHaveCount(0);
  await form(page).getByRole('button', { name: 'Logga', exact: true }).tap();
  await expect(box).toContainText('2 portioner kvar');

  // Svep = slut, med Ångra.
  await swipeLeft(box);
  await expect(box).toHaveCount(0);
  const toast = page.getByTestId('picker-toast');
  await expect(toast).toContainText('Matlådorna med Linsgryta är slut.');
  await toast.getByRole('button', { name: 'Ångra' }).tap();
  await expect(box).toContainText('2 portioner kvar');

  const stored = await dump(page);
  expect(stored.foodLog).toHaveLength(2);
  expect(stored.recipes).toEqual([
    expect.objectContaining({
      id: 'linsgryta',
      batch: { startedAt: expect.any(Number), portions: 4 },
    }),
  ]);
  expect(errors).toEqual([]);
});

test('laga en rätt: engångsrätten loggas direkt och hamnar under Arkiv i Egna', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openFood(page, { recipes: [STEW] });
  await page.getByRole('button', { name: 'Sök och logga mat' }).tap();
  await sheet(page).getByTestId('cook-once-open').getByRole('button').tap();

  const recipe = page.getByTestId('recipe-form');
  await expect(recipe.getByRole('heading', { name: 'Laga en rätt' })).toBeVisible();
  await expect(recipe.getByTestId('recipe-keep').getByRole('switch')).not.toBeChecked();
  await recipe.getByLabel('Rättens namn').fill('Pytt i panna');
  await recipe.getByRole('button', { name: 'Lägg till ingrediens' }).tap();
  await sheet(page).getByLabel('Sök livsmedel').fill('potatis');
  await sheet(page).getByTestId('search-result').filter({ hasText: 'Potatis kokt' }).first().tap();
  await chooseUnit(page, 'g');
  await form(page).getByLabel('Mängd (g)').fill('600');
  await form(page).getByRole('button', { name: 'Lägg till', exact: true }).tap();
  await recipe.getByLabel('Antal portioner').fill('2');
  await recipe.getByRole('button', { name: 'Fortsätt till loggning' }).tap();

  // Loggformuläret för rätten: 1 portion, utan matlådor den här gången.
  await expect(page.getByRole('heading', { name: 'Logga: Pytt i panna' })).toBeVisible();
  await expect(form(page).getByLabel('Mängd (portion)')).toHaveValue('1');
  await page.getByTestId('batch-offer').getByRole('switch').uncheck();
  await form(page).getByRole('button', { name: 'Logga', exact: true }).tap();
  await expect(form(page)).toBeHidden();
  await expect(sheet(page).getByTestId('leftover')).toHaveCount(0);

  // Inte bland Måltider, men i sökningen.
  await sheet(page).getByRole('button', { name: 'Måltider', exact: true }).tap();
  await expect(sheet(page).getByTestId('quick-pick')).toHaveText([/Linsgryta/]);
  await sheet(page).getByLabel('Sök livsmedel').fill('pytt');
  await expect(sheet(page).getByTestId('search-result').first()).toContainText('Pytt i panna');
  await sheet(page).getByRole('button', { name: 'Stäng', exact: true }).tap();

  // Egna: recepten överst, engångsrätten under Arkiv.
  await page.getByRole('button', { name: 'Egna', exact: true }).tap();
  const visibleRecipes = page.getByTestId('own-recipe').filter({ visible: true });
  await expect(visibleRecipes).toHaveCount(1);
  const archive = page.getByTestId('recipe-archive');
  await archive.getByText('Arkiv (1)').tap();
  await expect(archive.getByTestId('own-recipe')).toContainText('Pytt i panna');

  // Spara bland mina recept: flyttas upp.
  await archive.getByTestId('own-recipe').getByRole('button').first().tap();
  await page.getByTestId('recipe-keep').getByRole('switch').check();
  await page.getByRole('button', { name: 'Spara recept' }).tap();
  await expect(visibleRecipes).toHaveCount(2);
  await expect(archive).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('inställningar: sök hittar paneler på nyckelord', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await seed(page, { profile: PROFILE });
  await page.goto('./#/installningar');
  const search = page.getByTestId('settings-search');
  await search.fill('backup');
  await expect(page.getByTestId('settings-sakerhetskopia')).toBeVisible();
  await expect(page.getByTestId('settings-profil')).toHaveCount(0);
  await search.fill('målvikt');
  await page.getByTestId('settings-profil').getByRole('button').tap();
  await expect(page.getByRole('dialog', { name: 'Profil' })).toBeVisible();
  await page.getByRole('button', { name: 'Stäng', exact: true }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await search.fill('xyz');
  await expect(page.getByRole('status').filter({ hasText: 'Inga inställningar' })).toBeVisible();
  await search.fill('');
  await expect(page.getByTestId('settings-profil')).toBeVisible();
  expect(errors).toEqual([]);
});
