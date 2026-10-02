import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectErrors, dump, seed } from './helpers.ts';

/**
 * Inställningar → Måltider: lägg till, byt namn, ändra ordning (dra-handtag och piltangenter),
 * logga i Kvällsmål (pågående måltid efter klockslaget) och ta bort en måltid med poster (frågar
 * vart de ska flyttas). Påhittade testvärden.
 */

test.use({ locale: 'sv-SE', timezoneId: 'Europe/Stockholm', serviceWorkers: 'block' });

const TODAY = '2026-09-24';

const LIVSMEDEL = {
  format: 'viktresan-livsmedel',
  source: 'Testdatabas',
  license: 'CC BY 4.0',
  retrieved: '2026-09-01',
  extra: ['fiberG'],
  foods: [
    [1, 'Kvarg naturell', 63, 11, 4, 0.2, '', [0]],
    [2, 'Knäckebröd fullkorn', 340, 10, 60, 2, '', [16]],
  ],
};

async function open(page: Page, time: string, hash: string) {
  await page.clock.setFixedTime(new Date(`${TODAY}T${time}:00+02:00`));
  await page.route('**/livsmedel.json', (route) => route.fulfill({ json: LIVSMEDEL }));
  await page.route('**/fineli.json', (route) =>
    route.fulfill({ json: { format: 'viktresan-livsmedel', foods: [] } }),
  );
  await page.goto('./');
  await seed(page, { settings: { preferences: { whatToEatTipSeen: true } } });
  await page.goto(`./${hash}`);
  await page.reload();
}

function panel(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Måltider' });
}

async function rowNames(page: Page): Promise<string[]> {
  return panel(page).getByTestId('meal-slots').locator('.list-row-primary').allTextContents();
}

/** Drar raden i handtaget `rows` rader upp (negativt) eller ner med musen. */
async function drag(page: Page, handle: Locator, rows: number) {
  const box = await handle.boundingBox();
  if (!box) throw new Error('Handtaget saknas');
  const row = await handle.locator('xpath=ancestor::li[1]').boundingBox();
  const height = row?.height ?? 56;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const steps = 8;
  for (let i = 1; i <= steps; i += 1) await page.mouse.move(x, y + (rows * height * i) / steps);
  await page.mouse.up();
}

test('lägg till, byt namn och ändra ordning på måltider', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, '12:30', '#/installningar/maltider');
  await expect(panel(page)).toBeVisible();
  expect(await rowNames(page)).toEqual([
    'Frukost',
    'Förmiddagsmellanmål',
    'Lunch',
    'Eftermiddagsmellanmål',
    'Middag',
    'Kvällsmål',
  ]);
  await expect(panel(page).getByTestId('meal-slot-kvall')).toContainText('21:00 · Mellanmål');

  // Lägg till.
  await panel(page).getByRole('button', { name: 'Lägg till måltid' }).tap();
  const form = page.getByRole('dialog', { name: 'Ny måltid' });
  await form.getByLabel('Namn').fill('Lunch');
  await form.getByLabel('Ungefärlig tid').fill('23:30');
  await form.getByRole('button', { name: 'Spara måltid' }).tap();
  await expect(form.getByRole('alert')).toHaveText('Det finns redan en måltid med det namnet.');
  await form.getByLabel('Namn').fill('Nattmat');
  await form.getByRole('button', { name: 'Spara måltid' }).tap();
  await expect(form).toHaveCount(0);
  await expect(page.getByTestId('meal-settings-toast')).toContainText('La till Nattmat.');
  expect((await rowNames(page)).at(-1)).toBe('Nattmat');

  // Byt namn och typ.
  await panel(page)
    .getByTestId('meal-slot-lunch')
    .getByRole('button', { name: /^Lunch/ })
    .tap();
  const edit = page.getByRole('dialog', { name: 'Lunch' });
  await edit.getByLabel('Namn').fill('Lunchlåda');
  await edit.getByLabel('Huvudmåltid').check();
  await edit.getByRole('button', { name: 'Spara måltid' }).tap();
  await expect(edit).toHaveCount(0);
  await expect(panel(page).getByTestId('meal-slot-lunch')).toContainText('Lunchlåda');

  // Dra Kvällsmål en rad upp (före Middag).
  await drag(page, panel(page).getByRole('button', { name: 'Ändra ordning: Kvällsmål' }), -1);
  await expect
    .poll(() => rowNames(page))
    .toEqual([
      'Frukost',
      'Förmiddagsmellanmål',
      'Lunchlåda',
      'Eftermiddagsmellanmål',
      'Kvällsmål',
      'Middag',
      'Nattmat',
    ]);
  // Piltangent på handtaget: Frukost ett steg ner.
  await panel(page).getByRole('button', { name: 'Ändra ordning: Frukost' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect
    .poll(() => rowNames(page))
    .toEqual([
      'Förmiddagsmellanmål',
      'Frukost',
      'Lunchlåda',
      'Eftermiddagsmellanmål',
      'Kvällsmål',
      'Middag',
      'Nattmat',
    ]);
  await expect(panel(page).getByRole('status').first()).toContainText('Frukost: plats 2 av 7.');

  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(a11y.violations).toEqual([]);

  // Ordningen och namnen gäller i Mat → Dag.
  await page.goto('./#/mat');
  await expect(page.locator('.meal-sections .accordion-name')).toHaveText([
    /^Förmiddagsmellanmål/,
    /^Frukost/,
    /^Lunchlåda/,
    /^Eftermiddagsmellanmål/,
    /^Kvällsmål/,
    /^Middag/,
    /^Nattmat/,
  ]);
  expect(errors).toEqual([]);
});

test('loggar i Kvällsmål kl. 21:30 och flyttar posterna när måltiden tas bort', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await open(page, '21:30', '#/mat');

  // Pågående måltid kl. 21:30 = Kvällsmål: utfälld och förvald i logg-sheeten.
  const kvall = page.getByTestId('meal-kvall');
  await expect(kvall).toBeVisible();
  await page.getByRole('button', { name: 'Sök och logga mat' }).tap();
  const picker = page.getByRole('dialog', { name: 'Logga mat' });
  await picker.getByLabel('Sök livsmedel').fill('kvarg');
  await picker.getByTestId('search-result').filter({ hasText: 'Kvarg naturell' }).first().tap();
  const logForm = page.getByTestId('food-log-form');
  await expect(logForm.getByLabel('Måltid')).toHaveValue('kvall');
  await expect(logForm.getByLabel('Måltid').locator('option')).toHaveText([
    'Frukost',
    'Förmiddagsmellanmål',
    'Lunch',
    'Eftermiddagsmellanmål',
    'Middag',
    'Kvällsmål',
  ]);
  await logForm
    .getByRole('group', { name: 'Enhet' })
    .getByRole('button', { name: 'g', exact: true })
    .tap();
  await logForm.getByLabel('Mängd (g)').fill('200');
  await logForm.getByRole('button', { name: 'Logga', exact: true }).tap();
  await expect(picker.getByRole('status')).toContainText('till kvällsmål');
  await picker.getByRole('button', { name: 'Stäng', exact: true }).tap();
  await expect(picker).toHaveCount(0);
  const toggle = kvall.getByRole('heading').getByRole('button');
  await expect(toggle).toHaveText(/Kvällsmål\s*1 post\s*126 kcal/);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(kvall.getByTestId('food-entry')).toContainText('Kvarg naturell');

  // Ta bort Kvällsmål: appen frågar vart posten ska flyttas.
  await page.goto('./#/installningar/maltider');
  await panel(page)
    .getByTestId('meal-slot-kvall')
    .getByRole('button', { name: /^Kvällsmål/ })
    .tap();
  await page
    .getByRole('dialog', { name: 'Kvällsmål' })
    .getByRole('button', {
      name: 'Ta bort måltiden',
    })
    .tap();
  const remove = page.getByRole('dialog', { name: 'Ta bort Kvällsmål' });
  await expect(remove).toContainText('Kvällsmål har 1 post i matloggen.');
  // Förval: närmaste mellanmål (15:00), övriga går att välja.
  await expect(remove.getByRole('radio', { name: /^Eftermiddagsmellanmål/ })).toBeChecked();
  await remove.getByRole('radio', { name: /^Middag/ }).check();
  await remove.getByRole('button', { name: 'Ta bort och flytta posterna' }).tap();
  await expect(remove).toHaveCount(0);
  await expect(page.getByTestId('meal-settings-toast')).toContainText(
    'Tog bort Kvällsmål. Posterna flyttades till Middag.',
  );
  await expect(panel(page).getByTestId('meal-slot-kvall')).toHaveCount(0);

  const stored = await dump(page);
  expect(stored.mealSlots.map((m) => m.id)).not.toContain('kvall');
  expect(stored.foodLog).toEqual([
    expect.objectContaining({ name: 'Kvarg naturell', meal: 'middag' }),
  ]);

  // En tom måltid tas bort direkt (med Ångra).
  await panel(page)
    .getByTestId('meal-slot-formiddag')
    .getByRole('button', { name: /^Förmiddag/ })
    .tap();
  await page
    .getByRole('dialog', { name: 'Förmiddagsmellanmål' })
    .getByRole('button', { name: 'Ta bort måltiden' })
    .tap();
  await expect(page.getByTestId('meal-settings-toast')).toContainText(
    'Tog bort Förmiddagsmellanmål.',
  );
  await page.getByTestId('meal-settings-toast').getByRole('button', { name: 'Ångra' }).tap();
  await expect(panel(page).getByTestId('meal-slot-formiddag')).toBeVisible();

  // Mat → Dag: posten ligger under Middag och Kvällsmål finns inte längre.
  await page.goto('./#/mat');
  await expect(page.getByTestId('meal-kvall')).toHaveCount(0);
  await expect(page.getByTestId('meal-middag').getByRole('heading')).toContainText('1 post');
  expect(errors).toEqual([]);
});
