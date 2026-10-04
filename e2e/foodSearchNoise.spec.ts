import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectErrors, isoDaysFromToday, seed, swipeLeft, type SeedData } from './helpers.ts';

// Service workern skulle annars svara på json-filerna från sin cache, förbi page.route.
test.use({ serviceWorkers: 'block' });

/** Påhittade testvärden i Livsmedelsverket-formatet – inte riktiga data. */
const LIVSMEDEL = {
  format: 'viktresan-livsmedel',
  source: 'Testdatabas',
  license: 'CC BY 4.0',
  retrieved: '2026-09-01',
  foods: [
    [1, 'Bröd fullkorn råg', 230, 7, 40, 3],
    [2, 'Bröd fullkorn vete', 240, 9, 42, 3],
    [3, 'Bröd fullkorn havre', 250, 8, 41, 4],
    [4, 'Bröd fullkorn dinkel', 245, 9, 40, 3],
    [5, 'Bröd fullkorn korn', 235, 8, 41, 3],
    [6, 'Bröd vitt', 260, 8, 50, 3],
    [7, 'Godis gelé', 340, 4, 80, 0],
    [8, 'Godis choklad', 520, 7, 55, 30],
    [9, 'Gurka', 12, 0.6, 2, 0.1],
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

const per100 = { kcal: 380, proteinG: 10, carbsG: 60, fatG: 8 };

async function start(page: Page, data: SeedData = {}) {
  await page.route('**/livsmedel.json', (route) => route.fulfill({ json: LIVSMEDEL }));
  // Tom Fineli-databas: testerna bygger på den mockade Livsmedelsverket-datan.
  await page.route('**/fineli.json', (route) =>
    route.fulfill({ json: { format: 'viktresan-livsmedel', foods: [] } }),
  );
  await page.goto('./');
  await seed(page, { profile: PROFILE, ...data });
}

async function openPicker(page: Page): Promise<Locator> {
  await page.goto('./#/mat');
  await page.getByRole('button', { name: 'Sök och logga mat' }).tap();
  const picker = page.getByRole('dialog', { name: 'Logga mat' });
  await expect(picker).toBeVisible();
  return picker;
}

async function search(picker: Locator, text: string) {
  await picker.getByLabel('Sök livsmedel').fill(text);
}

function hit(picker: Locator, name: string): Locator {
  return picker.getByTestId('search-result-row').filter({ hasText: name });
}

/** Håller fingret på raden (långtryck) med pekarhändelser. */
async function longPress(row: Locator) {
  const content = row.locator('.pick-content');
  const box = await content.boundingBox();
  if (!box) throw new Error('Raden syns inte');
  const init = {
    pointerId: 9,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height / 2,
  };
  await content.dispatchEvent('pointerdown', init);
  await row.page().waitForTimeout(700);
  await content.dispatchEvent('pointerup', init);
}

test('dölja ett livsmedel med svep, ångra, och dölja med långtryck', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  const picker = await openPicker(page);
  await search(picker, 'gurka');
  await expect(hit(picker, 'Gurka')).toHaveCount(1);

  await swipeLeft(hit(picker, 'Gurka'));
  const toast = picker.getByTestId('picker-toast');
  await expect(toast).toContainText('Dolde Gurka i sökningen.');
  await expect(hit(picker, 'Gurka')).toHaveCount(0);
  await expect(picker.getByText('Inga träffar.')).toBeVisible();

  await toast.getByRole('button', { name: 'Ångra' }).tap();
  await expect(hit(picker, 'Gurka')).toHaveCount(1);

  // Långtryck öppnar en meny med Dölj.
  await longPress(hit(picker, 'Gurka'));
  const menu = page.getByRole('dialog', { name: 'Gurka' });
  await expect(menu).toBeVisible();
  await menu.getByRole('button', { name: 'Dölj' }).tap();
  await expect(menu).toBeHidden();
  await expect(hit(picker, 'Gurka')).toHaveCount(0);
  // Långtrycket valde inte livsmedlet.
  await expect(page.getByTestId('food-log-form')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('en dold kategori och en avstängd källa syns inte i sökningen, egna visas alltid', async ({
  page,
}) => {
  await start(page, {
    foods: [{ id: 'egen:g', name: 'Godis hemgjort', source: 'egen', per100, createdAt: 1 }],
    // Bröd har loggats – det föreslås inte att dölja.
    foodLog: [
      {
        id: 'b1',
        date: isoDaysFromToday(-2),
        meal: 'frukost',
        foodId: 'lv:1',
        name: 'Bröd fullkorn råg',
        amount: 50,
        unit: 'g',
        grams: 50,
        per100,
        createdAt: 1,
      },
    ],
  });
  await page.goto('./#/installningar');
  await page.getByTestId('settings-matsokning').tap();
  const panel = page.getByRole('dialog', { name: 'Matsökning' });
  // Förslag på aldrig loggade kategorier.
  await expect(panel.getByTestId('category-suggestions')).toContainText('Godis');
  await expect(panel.getByTestId('category-suggestions')).not.toContainText('Bröd');
  const godis = panel.getByRole('switch', { name: 'Godis' });
  await expect(godis).toBeChecked();
  await godis.uncheck();
  await expect(godis).not.toBeChecked();
  await expect(panel.getByTestId('category-suggestions')).not.toContainText('Godis');

  const picker = await openPicker(page);
  await search(picker, 'godis');
  await expect(picker.getByTestId('search-result')).toHaveCount(1);
  await expect(hit(picker, 'Godis hemgjort')).toHaveCount(1);

  // Livsmedelsverket avstängd: inga träffar därifrån.
  await page.goto('./#/installningar/matsokning');
  const panel2 = page.getByRole('dialog', { name: 'Matsökning' });
  await panel2.getByRole('switch', { name: 'Livsmedelsverket' }).uncheck();
  const picker2 = await openPicker(page);
  await search(picker2, 'gurka');
  await expect(picker2.getByText('Inga träffar.')).toBeVisible();
});

test('återställa ett dolt livsmedel från inställningarna', async ({ page }) => {
  await start(page, {
    hiddenFoods: [
      { key: 'livsmedel:lv:9', kind: 'livsmedel', value: 'lv:9', name: 'Gurka', createdAt: 2 },
      { key: 'livsmedel:lv:7', kind: 'livsmedel', value: 'lv:7', name: 'Godis gelé', createdAt: 1 },
    ],
  });
  let picker = await openPicker(page);
  await search(picker, 'gurka');
  await expect(picker.getByText('Inga träffar.')).toBeVisible();

  await page.goto('./#/installningar/matsokning');
  const panel = page.getByRole('dialog', { name: 'Matsökning' });
  const list = panel.getByTestId('hidden-foods');
  await expect(list.getByTestId('hidden-food')).toHaveCount(2);
  await list.getByLabel('Sök bland dolda livsmedel').fill('gurk');
  await expect(list.getByTestId('hidden-food')).toHaveCount(1);
  await list.getByRole('button', { name: 'Återställ Gurka' }).tap();
  await expect(panel.getByTestId('search-settings-toast')).toContainText(
    'Gurka visas igen i sökningen.',
  );
  await list.getByLabel('Sök bland dolda livsmedel').fill('');
  await expect(list.getByTestId('hidden-food')).toHaveCount(1);

  picker = await openPicker(page);
  await search(picker, 'gurka');
  await expect(hit(picker, 'Gurka')).toHaveCount(1);
});

test('ta bort en egen vara – tidigare loggar finns kvar', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, {
    foods: [
      {
        id: 'egen:k',
        name: 'Knäckebröd hemma',
        source: 'egen',
        per100,
        fiberG: 15,
        createdAt: 1,
      },
    ],
    foodLog: [
      {
        id: 'k1',
        date: isoDaysFromToday(0),
        meal: 'frukost',
        foodId: 'egen:k',
        name: 'Knäckebröd hemma',
        amount: 30,
        unit: 'g',
        grams: 30,
        per100,
        createdAt: Date.now() - 60_000,
      },
    ],
  });
  const picker = await openPicker(page);
  await search(picker, 'knäckebröd');
  await expect(hit(picker, 'Knäckebröd hemma')).toHaveCount(1);
  await swipeLeft(hit(picker, 'Knäckebröd hemma'));

  // Bekräftelse innan den tas bort för gott.
  const confirm = page.getByRole('dialog', { name: 'Ta bort Knäckebröd hemma?' });
  await expect(confirm).toContainText('Tidigare loggar påverkas inte.');
  await confirm.getByRole('button', { name: 'Ta bort' }).tap();
  await expect(picker.getByTestId('picker-toast')).toContainText('Tog bort Knäckebröd hemma.');
  await expect(hit(picker, 'Knäckebröd hemma')).toHaveCount(0);
  // Inte heller i Senaste, trots att den loggats idag.
  await search(picker, '');
  await expect(
    picker.getByTestId('quick-pick').filter({ hasText: 'Knäckebröd hemma' }),
  ).toHaveCount(0);
  await picker.getByRole('button', { name: 'Stäng' }).first().tap();
  await expect(picker).toBeHidden();

  // Loggen finns kvar med kcal och fiber (fibern slås upp på det borttagna livsmedlet).
  const frukost = page.getByRole('button', { name: /^Frukost 1 post/ });
  await expect(frukost).toContainText('Fi 4,5 g');
  await frukost.tap();
  const entry = page.getByTestId('food-entry').filter({ hasText: 'Knäckebröd hemma' });
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText('114 kcal');
  await expect(entry).toContainText('Fi 4,5 g');

  // Inte kvar under Egna.
  await page.getByRole('button', { name: 'Egna', exact: true }).tap();
  await expect(page.getByRole('heading', { name: 'Egna livsmedel' })).toBeVisible();
  await expect(page.getByText('Knäckebröd hemma')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('avbruten borttagning lägger tillbaka raden', async ({ page }) => {
  await start(page, {
    foods: [{ id: 'egen:k', name: 'Knäckebröd hemma', source: 'egen', per100, createdAt: 1 }],
  });
  const picker = await openPicker(page);
  await search(picker, 'knäckebröd');
  await swipeLeft(hit(picker, 'Knäckebröd hemma'));
  const confirm = page.getByRole('dialog', { name: 'Ta bort Knäckebröd hemma?' });
  await confirm.getByRole('button', { name: 'Stäng' }).tap();
  await expect(confirm).toBeHidden();
  await expect(hit(picker, 'Knäckebröd hemma').getByTestId('search-result')).toBeInViewport();
});

test('loggade först och högst tre varianter innan "Visa fler varianter"', async ({ page }) => {
  await start(page, {
    foodLog: [
      {
        id: 'b1',
        date: isoDaysFromToday(-1),
        meal: 'frukost',
        foodId: 'lv:6',
        name: 'Bröd vitt',
        amount: 40,
        unit: 'g',
        grams: 40,
        per100,
        createdAt: 1,
      },
    ],
  });
  const picker = await openPicker(page);
  await search(picker, 'bröd');
  const names = picker.getByTestId('search-result').locator('.pick-name');
  await expect(names).toHaveCount(4);
  // Nyligen loggat först, sedan tre av fem "Bröd fullkorn".
  await expect(names.first()).toHaveText('Bröd vitt');
  const more = picker.getByTestId('more-variants');
  await expect(more).toHaveText('Visa fler varianter av Bröd fullkorn (2)');
  await more.tap();
  await expect(names).toHaveCount(6);
  await expect(more).toHaveCount(0);
});
