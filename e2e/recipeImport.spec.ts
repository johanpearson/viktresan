import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectErrors, dump, seed, swipeLeft } from './helpers.ts';

/**
 * Receptimport: delning via share target (simulerad med manifestets GET-parametrar),
 * AI-svaret klistras in, granskning med säker/osäker/ingen träff, lösning med sök-sheeten,
 * sparat recept med källa och en loggad portion. Appen gör inga anrop till receptsajten.
 */
const WEDNESDAY = '2026-09-23';
const RECIPE_URL = 'https://www.ica.se/recept/kycklinggryta-123/';

// Service workern skulle annars svara på livsmedel.json från sin cache, förbi page.route.
test.use({ serviceWorkers: 'block' });

/** Påhittade testvärden i Livsmedelsverket-formatet – inte riktiga data. */
const LIVSMEDEL = {
  format: 'viktresan-livsmedel',
  source: 'Testdatabas',
  license: 'CC BY 4.0',
  retrieved: '2026-09-01',
  foods: [
    [90001, 'Vetemjöl', 340, 10, 70, 1.5],
    [90002, 'Tomater krossade konserv', 20, 1, 3, 0.2],
    [90003, 'Kyckling bröstfilé rå', 110, 23, 0, 1.5],
    [90004, 'Smör normalsaltat 80% fett', 720, 0.6, 0.6, 80],
    [90005, 'Bregott normalsaltat 75% fett', 670, 0.5, 0.5, 75],
    [90006, 'Salt', 0, 0, 0, 0],
  ],
};

const ANSWER = {
  namn: 'Kycklinggryta',
  portioner: 4,
  ingredienser: [
    { original: '2 dl vetemjöl', mangd: 2, enhet: 'dl', livsmedel: 'vetemjöl' },
    {
      original: '1 burk krossade tomater (400 g)',
      mangd: 1,
      enhet: 'burk',
      livsmedel: 'krossade tomater',
    },
    { original: 'ca 500 g kycklingfilé', mangd: 500, enhet: 'g', livsmedel: 'kycklingfilé' },
    { original: '2 msk smör', mangd: 2, enhet: 'msk', livsmedel: 'smör' },
    { original: 'salt och peppar efter smak', mangd: null, enhet: null, livsmedel: 'salt' },
  ],
  kallaUrl: RECIPE_URL,
};

function importSheet(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Importera recept' });
}

function importRow(page: Page, text: string): Locator {
  return importSheet(page).getByTestId('recipe-ingredient').filter({ hasText: text });
}

function ingredientSheet(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Ingrediens' });
}

async function pasteAnswer(page: Page, answer: string) {
  const ai = importSheet(page).getByTestId('recipe-ai');
  await ai.getByLabel('AI-tjänstens svar (JSON)').fill(answer);
  await ai.getByRole('button', { name: 'Granska svaret' }).tap();
}

/** Byter matchning för en rad: radens sheet → sök-sheeten → Lägg till → Klar. */
async function resolve(page: Page, row: string, query: string, name: string) {
  await importRow(page, row).getByRole('button').first().tap();
  await ingredientSheet(page).getByTestId('ingredient-food').getByRole('button').tap();
  const picker = page.getByRole('dialog', { name: 'Välj livsmedel' });
  await picker.getByLabel('Sök livsmedel').fill(query);
  await picker.getByTestId('search-result').filter({ hasText: name }).first().tap();
  await picker.getByRole('button', { name: 'Lägg till', exact: true }).tap();
  await expect(picker).toHaveCount(0);
  await ingredientSheet(page).getByRole('button', { name: 'Klar' }).tap();
  await expect(ingredientSheet(page)).toHaveCount(0);
}

/** "Per portion: 296 kcal" → 296. */
async function perPortionKcal(page: Page): Promise<number> {
  const text = await importSheet(page)
    .getByTestId('recipe-per-portion')
    .locator('.kcal')
    .innerText();
  return Number(text.replace(/\D/g, ''));
}

test('delad länk → AI-svar → granskning → sparat recept med källa → logga 1 portion', async ({
  page,
}) => {
  const errors = collectErrors(page);
  const external: string[] = [];
  page.on('request', (req) => {
    if (!req.url().startsWith('http://localhost')) external.push(req.url());
  });
  await page.clock.setFixedTime(new Date(`${WEDNESDAY}T18:30:00`));
  await page.route('**/livsmedel.json', (route) => route.fulfill({ json: LIVSMEDEL }));
  // Tom Fineli-databas: testerna bygger på den mockade Livsmedelsverket-datan.
  await page.route('**/fineli.json', (route) =>
    route.fulfill({ json: { format: 'viktresan-livsmedel', foods: [] } }),
  );
  await page.goto('./');
  await seed(page, {
    profile: { startDate: '2026-09-01', startWeightKg: 90, heightCm: 180, goalWeightKg: 80 },
  });

  // Delningsmenyn på Android: länken hamnar i texten (url tom), som share_target skickar den.
  const text = encodeURIComponent(`Kycklinggryta | ICA ${RECIPE_URL}`);
  await page.goto(`./?share-title=Kycklinggryta&share-text=${text}&share-url=`);
  const sheet = importSheet(page);
  await expect(sheet).toBeVisible();
  // Delningens parametrar tas bort; panelen ligger på Mat → Egna.
  expect(new URL(page.url()).search).toBe('');
  await expect(sheet.getByTestId('recipe-input')).toHaveValue(RECIPE_URL);
  await expect(sheet.getByTestId('recipe-input-note')).toContainText('ica.se');
  const prompt = sheet.getByTestId('recipe-ai-prompt');
  await expect(prompt).toHaveValue(/ENDAST/);
  await expect(prompt).toHaveValue(new RegExp(`Länk: ${RECIPE_URL}`));

  // Ogiltigt svar ger ett tydligt fel.
  await pasteAnswer(page, '{"namn": "Kycklinggryta", "ingredienser": [');
  await expect(sheet.getByTestId('recipe-ai-error')).toContainText('inte giltig JSON');

  await pasteAnswer(page, `\`\`\`json\n${JSON.stringify(ANSWER)}\n\`\`\``);
  const preview = sheet.getByTestId('recipe-ai-preview');
  await expect(preview).toContainText('Kycklinggryta');
  await expect(preview).toContainText('5');
  await sheet.getByRole('button', { name: 'Granska ingredienser' }).tap();

  // Granskning: säker, osäker och ingen träff.
  await expect(sheet.getByLabel('Receptets namn')).toHaveValue('Kycklinggryta');
  await expect(sheet.getByLabel('Antal portioner')).toHaveValue('4');
  await expect(sheet.getByTestId('recipe-source')).toContainText('ica.se');
  await expect(importRow(page, '2 dl vetemjöl')).toContainText('Vetemjöl');
  await expect(importRow(page, '2 dl vetemjöl')).toContainText('Säker');
  await expect(importRow(page, 'krossade tomater')).toContainText(
    'Tomater krossade konserv · 400 g',
  );
  await expect(importRow(page, 'krossade tomater')).toContainText('80 kcal');
  await expect(importRow(page, 'kycklingfilé')).toContainText('Ingen träff');
  await expect(importRow(page, '2 msk smör')).toContainText('Smör normalsaltat 80% fett');
  await expect(importRow(page, '2 msk smör')).toContainText('Osäker');
  // Salt och peppar efter smak föreslås som "räknas inte" – tydligt märkt.
  await expect(importRow(page, 'salt och peppar').getByTestId('uncounted-tag')).toHaveText(
    'Räknas inte',
  );
  await expect(sheet.getByTestId('import-summary')).toHaveText(
    '5 ingredienser · 2 att granska · 1 räknas inte',
  );
  await expect(sheet.getByRole('button', { name: /Hoppa över/ })).toHaveCount(0);

  // Spara kräver att varje rad som räknas har livsmedel och mängd.
  await sheet.getByRole('button', { name: 'Spara recept' }).tap();
  await expect(sheet.getByRole('alert')).toContainText('ca 500 g kycklingfilé');

  // Redigera en ingrediens: originaltexten är skrivskyddad, matchningen byts i sök-sheeten
  // ("smör" och receptets 2 msk förifyllt).
  await importRow(page, '2 msk smör').getByRole('button').first().tap();
  const ingredient = ingredientSheet(page);
  await expect(ingredient.getByTestId('ingredient-original')).toHaveText('2 msk smör');
  await expect(
    ingredient.getByTestId('ingredient-original').locator('input, textarea'),
  ).toHaveCount(0);
  await expect(ingredient.getByLabel('Mängd')).toHaveValue('2');
  await ingredient.getByTestId('ingredient-food').getByRole('button').tap();
  const picker = page.getByRole('dialog', { name: 'Välj livsmedel' });
  await expect(picker.getByLabel('Sök livsmedel')).toHaveValue('smör');
  await picker.getByLabel('Sök livsmedel').fill('bregott');
  await picker.getByTestId('search-result').filter({ hasText: 'Bregott' }).first().tap();
  await expect(picker.getByLabel('Mängd (msk)')).toHaveValue('2');
  await picker.getByRole('button', { name: 'Lägg till', exact: true }).tap();
  await expect(picker).toHaveCount(0);
  await expect(ingredient.getByTestId('ingredient-food')).toContainText('Bregott');
  await ingredient.getByRole('button', { name: 'Klar' }).tap();
  await expect(ingredient).toHaveCount(0);
  await expect(importRow(page, '2 msk smör')).toContainText('Bregott normalsaltat 75% fett');
  await expect(importRow(page, '2 msk smör')).toContainText('Säker');

  // Ingen träff: välj kycklingen (500 g förifyllt).
  await resolve(page, 'kycklingfilé', 'kyckling', 'Kyckling bröstfilé rå');
  await expect(importRow(page, 'kycklingfilé')).toContainText('Kyckling bröstfilé rå · 500 g');
  await expect(sheet.getByTestId('import-summary')).toHaveText(
    '5 ingredienser · alla matchade · 1 räknas inte',
  );

  // Ändrad mängd: totalerna per portion räknas om direkt.
  const before = await perPortionKcal(page);
  await importRow(page, '2 dl vetemjöl').getByRole('button').first().tap();
  await ingredientSheet(page).getByLabel('Mängd').fill('3');
  await ingredientSheet(page).getByRole('button', { name: 'Klar' }).tap();
  await expect(importRow(page, '2 dl vetemjöl')).toContainText('Vetemjöl · 3 dl');
  await expect.poll(() => perPortionKcal(page)).toBeGreaterThan(before);

  // Ta bort med ikonen och Ångra; sedan med svep.
  const withTomatoes = await perPortionKcal(page);
  await sheet.getByRole('button', { name: 'Ta bort ingrediensen Tomater krossade konserv' }).tap();
  await expect(importRow(page, 'krossade tomater')).toHaveCount(0);
  await expect.poll(() => perPortionKcal(page)).toBeLessThan(withTomatoes);
  const toast = sheet.getByTestId('recipe-toast');
  await expect(toast).toContainText('Tog bort 1 burk krossade tomater (400 g).');
  await toast.getByRole('button', { name: 'Ångra' }).tap();
  await expect(importRow(page, 'krossade tomater')).toHaveCount(1);
  await expect.poll(() => perPortionKcal(page)).toBe(withTomatoes);
  await swipeLeft(importRow(page, 'krossade tomater'));
  await expect(importRow(page, 'krossade tomater')).toHaveCount(0);

  // Lägg till en ingrediens längst ner via sök-sheeten.
  await sheet.getByRole('button', { name: 'Lägg till ingrediens' }).tap();
  const add = page.getByRole('dialog', { name: 'Lägg till ingrediens' });
  await add.getByLabel('Sök livsmedel').fill('smör');
  await add.getByTestId('search-result').filter({ hasText: 'Smör normalsaltat' }).first().tap();
  await add
    .getByRole('group', { name: 'Enhet' })
    .getByRole('button', { name: 'g', exact: true })
    .tap();
  await add.getByLabel('Mängd (g)').fill('10');
  await add.getByRole('button', { name: 'Lägg till', exact: true }).tap();
  await expect(add).toHaveCount(0);
  await expect(sheet.getByTestId('recipe-ingredient').last()).toContainText(
    'Smör normalsaltat 80% fett',
  );

  // Namn och portioner går att ändra i samma vy.
  await sheet.getByLabel('Receptets namn').fill('Kycklinggryta med smör');
  await sheet.getByLabel('Antal portioner').fill('5');

  await sheet.getByRole('button', { name: 'Spara recept' }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('own-toast')).toContainText(
    'Sparade receptet Kycklinggryta med smör.',
  );

  const stored = await dump(page);
  expect(stored.recipes).toHaveLength(1);
  const recipe = stored.recipes[0] as {
    name: string;
    servings: number;
    sourceUrl: string;
    items: {
      foodId: string;
      unit: string;
      amount: number;
      grams: number;
      per100: { kcal: number };
    }[];
  };
  expect(recipe).toMatchObject({
    name: 'Kycklinggryta med smör',
    servings: 5,
    sourceUrl: RECIPE_URL,
  });
  // Salt och peppar (räknas inte) och de borttagna tomaterna sparas inte.
  expect(recipe.items.map((i) => [i.foodId, i.unit, i.amount])).toEqual([
    ['lv:90001', 'dl', 3],
    ['lv:90003', 'g', 500],
    ['lv:90005', 'msk', 2],
    ['lv:90004', 'g', 10],
  ]);
  // De manuella valen sparas i matchningsminnet.
  expect(stored.settings.ingredientMatches).toMatchObject({
    smor: 'lv:90005',
    kycklingfile: 'lv:90003',
  });

  const perPortion = Math.round(
    recipe.items.reduce((s, i) => s + (i.grams * i.per100.kcal) / 100, 0) / 5,
  );
  const recipeRow = page.getByTestId('own-recipe').filter({ hasText: 'Kycklinggryta' });
  await expect(recipeRow).toContainText(`${String(perPortion)} kcal/portion`);

  // Källan visas i receptets detaljvy – och i redigeringsvyn, som är samma som granskningen.
  await recipeRow.getByRole('button').first().tap();
  const detail = page.getByTestId('own-detail');
  const source = detail.getByTestId('recipe-source');
  await expect(source).toContainText('ica.se');
  await expect(source.getByRole('link')).toHaveAttribute('href', RECIPE_URL);
  await detail.getByRole('button', { name: 'Redigera' }).tap();
  const editor = page.getByTestId('recipe-form');
  await expect(editor.getByTestId('recipe-source')).toContainText('ica.se');
  await expect(editor.getByTestId('recipe-ingredient')).toHaveCount(4);
  await editor.getByRole('button', { name: 'Avbryt' }).tap();

  // Nästa import: minnet föreslår Bregott direkt som säker träff.
  await page.getByTestId('recipe-import-open').getByRole('button').tap();
  await expect(importSheet(page).getByTestId('recipe-input-note')).toContainText('bild');
  await pasteAnswer(page, JSON.stringify(ANSWER));
  await importSheet(page).getByRole('button', { name: 'Granska ingredienser' }).tap();
  await expect(importRow(page, '2 msk smör')).toContainText('Bregott normalsaltat 75% fett');
  await expect(importRow(page, '2 msk smör')).toContainText('Säker');
  await expect(importRow(page, 'kycklingfilé')).toContainText('Kyckling bröstfilé rå');
  await importSheet(page).getByRole('button', { name: 'Stäng', exact: true }).tap();
  await expect(importSheet(page)).toHaveCount(0);

  // Logga 1 portion.
  await page.getByRole('button', { name: 'Dag', exact: true }).tap();
  await page.getByRole('button', { name: 'Sök och logga mat' }).tap();
  const search = page.getByRole('dialog');
  await search.getByLabel('Sök livsmedel').fill('kycklinggryta');
  await search.getByTestId('search-result').filter({ hasText: 'Kycklinggryta med smör' }).tap();
  const form = page.getByTestId('food-log-form');
  await form
    .getByRole('group', { name: 'Snabbval mängd' })
    .getByRole('button', { name: '1 portion' })
    .tap();
  await form.getByRole('button', { name: 'Logga', exact: true }).tap();
  await search.getByRole('button', { name: 'Stäng', exact: true }).tap();
  await expect(page.getByTestId('food-entry').filter({ hasText: 'Kycklinggryta' })).toContainText(
    `${String(perPortion)} kcal`,
  );
  expect((await dump(page)).foodLog).toEqual([
    expect.objectContaining({ name: 'Kycklinggryta med smör', unit: 'portion', amount: 1 }),
  ]);

  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('delning med avstängd Mat erbjuder att slå på den', async ({ page }) => {
  await page.goto('./');
  await seed(page, { settings: { features: { mat: false, version: 3 } } });
  await page.goto(`./?share-url=${encodeURIComponent(RECIPE_URL)}`);
  const toast = page.getByTestId('shortcut-toast');
  await expect(toast).toContainText('Mat är avstängt');
  await expect(toast).toContainText('Importera recept');
  await page.route('**/livsmedel.json', (route) => route.fulfill({ json: LIVSMEDEL }));
  // Tom Fineli-databas: testerna bygger på den mockade Livsmedelsverket-datan.
  await page.route('**/fineli.json', (route) =>
    route.fulfill({ json: { format: 'viktresan-livsmedel', foods: [] } }),
  );
  await toast.getByRole('button', { name: 'Slå på Mat' }).tap();
  await expect(importSheet(page)).toBeVisible();
  await expect(importSheet(page).getByTestId('recipe-input')).toHaveValue(RECIPE_URL);
});
