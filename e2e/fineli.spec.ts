import { expect, test, type Page } from '@playwright/test';
import { collectErrors, isoDaysFromToday, seed } from './helpers.ts';

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

async function openPicker(page: Page) {
  await page.goto('./');
  await seed(page, { profile: PROFILE });
  await page.goto('./#/mat');
  await page.getByRole('button', { name: 'Sök och logga mat' }).tap();
  return page.getByRole('dialog', { name: 'Logga mat' });
}

test('sökning ger träff från den inbyggda Fineli-databasen och den kan loggas', async ({
  page,
}) => {
  const errors = collectErrors(page);
  const picker = await openPicker(page);
  // Karelsk pirog finns bara i Fineli.
  await picker.getByLabel('Sök livsmedel').fill('karelsk pirog');
  const hit = picker.getByTestId('search-result').first();
  await expect(hit).toContainText('Karelsk pirog');
  const tag = hit.getByTestId('source-tag');
  await expect(tag).toHaveAttribute('data-source', 'fineli');
  await expect(tag).toContainText('Fineli');
  await expect(tag.getByText('Källa: Fineli.')).toBeAttached();

  await hit.tap();
  const form = page.getByTestId('food-log-form');
  await expect(form).toBeVisible();
  await expect(form.getByText('Fineli', { exact: true }).first()).toBeVisible();
  // Finelis fiber visas i näringsraden.
  await expect(form.getByTestId('log-macros')).toContainText('Fi');
  await form.getByRole('button', { name: 'Logga', exact: true }).tap();
  await expect(form).toBeHidden();
  await expect(page.getByTestId('food-entry').filter({ hasText: 'Karelsk pirog' })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('Om appen anger både Livsmedelsverket och Fineli som källa', async ({ page }) => {
  await page.goto('./#/installningar/om');
  const source = page.getByTestId('livsmedel-source');
  await expect(source).toContainText('Livsmedelsverkets livsmedelsdatabas (CC BY 4.0');
  await expect(source).toContainText('Fineli, Institutet för hälsa och välfärd (THL), version');
});

test.describe('sammanslagna källor', () => {
  // Service workern skulle annars svara på json-filerna från sin cache, förbi page.route.
  test.use({ serviceWorkers: 'block' });

  const file = (foods: unknown[]) => ({
    format: 'viktresan-livsmedel',
    source: 'Testdatabas',
    license: 'CC BY 4.0',
    retrieved: '2026-09-01',
    foods,
  });

  test('samma livsmedel visas en gång, från Livsmedelsverket, med källetikett', async ({
    page,
  }) => {
    await page.route('**/livsmedel.json', (route) =>
      route.fulfill({ json: file([[1, 'Rönnbär', 80, 1.5, 12, 0.5]]) }),
    );
    await page.route('**/fineli.json', (route) =>
      route.fulfill({
        json: file([
          [1, 'Rönnbär', 49, 1.4, 8.3, 0.5, 'BERFRESH'],
          [2, 'Rönnbärsgelé', 250, 0.2, 61, 0, 'JAM'],
        ]),
      }),
    );
    const picker = await openPicker(page);
    await picker.getByLabel('Sök livsmedel').fill('rönnbär');
    const results = picker.getByTestId('search-result');
    await expect(results).toHaveCount(2);
    await expect(results.nth(0)).toContainText('Rönnbär');
    await expect(results.nth(0).getByTestId('source-tag')).toHaveText(/^LV/);
    await expect(results.nth(1)).toContainText('Rönnbärsgelé');
    await expect(results.nth(1).getByTestId('source-tag')).toHaveText(/^Fineli/);

    // Kategorins enheter gäller även Fineli: sylt och gelé mäts i matskedar.
    await results.nth(1).tap();
    await expect(
      page
        .getByTestId('food-log-form')
        .getByRole('group', { name: 'Enhet' })
        .getByRole('button', { name: 'msk', exact: true }),
    ).toBeVisible();
  });
});
