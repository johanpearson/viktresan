import { expect, test, type Page } from '@playwright/test';
import { collectErrors, dump, isoDaysFromToday, seed } from './helpers.ts';

function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Huvudmeny' });
}

async function logWeight(page: Page, date: string, weight: string, note?: string) {
  await page.getByLabel('Datum').fill(date);
  await page.getByLabel('Vikt (kg)').fill(weight);
  if (note) {
    await page.getByRole('button', { name: 'Lägg till anteckning' }).tap();
    await page.getByLabel('Anteckning').fill(note);
  }
  await page.getByRole('button', { name: 'Spara', exact: true }).tap();
  const kg = `${weight.includes(',') ? weight : `${weight},0`} kg`;
  await expect(page.getByRole('status')).toContainText(`Sparade ${kg}`);
}

async function logSteps(page: Page, steps: string) {
  await page.getByLabel('Antal steg').fill(steps);
  await page.getByRole('button', { name: 'Spara', exact: true }).tap();
}

test('fyll profil, logga tre vikter och se översikt och graf', async ({ page }) => {
  const errors = collectErrors(page);

  // Profil – via kugghjulet på Översikt.
  await page.goto('./');
  await page.getByLabel('Inställningar').tap();
  await page.getByLabel('Startdatum').fill(isoDaysFromToday(-21));
  await page.getByLabel('Startvikt (kg)').fill('90');
  await page.getByLabel('Längd (cm)').fill('180');
  await page.getByLabel('Målvikt (kg)').fill('80');
  await page.getByRole('button', { name: 'Spara profil' }).tap();
  await expect(page.getByText('Profilen är sparad.')).toBeVisible();

  // Logga: Vikt är förvalt och förifyllt med startvikten, sedan med senast loggade värde.
  await nav(page).getByRole('link', { name: 'Logga' }).tap();
  await expect(page.getByRole('button', { name: 'Vikt', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByLabel('Vikt (kg)')).toHaveValue('90,0');
  await expect(page.getByLabel('Anteckning')).toBeHidden();
  await logWeight(page, isoDaysFromToday(-14), '88', 'Första veckan');
  await expect(page.getByLabel('Vikt (kg)')).toHaveValue('88,0');
  // Anteckningen döljs igen efter sparning.
  await expect(page.getByLabel('Anteckning')).toBeHidden();
  await logWeight(page, isoDaysFromToday(-7), '87,0');

  // Tredje vikten via ±0,1-knapparna: 86,2 → 86,1 → 86,0 → 86,1 → 86,0
  await page.getByLabel('Vikt (kg)').fill('86,2');
  const minus = page.getByRole('button', { name: 'Minska vikten med 0,1 kg' });
  const plus = page.getByRole('button', { name: 'Öka vikten med 0,1 kg' });
  await minus.tap();
  await minus.tap();
  await plus.tap();
  await minus.tap();
  await expect(page.getByLabel('Vikt (kg)')).toHaveValue('86,0');
  await expect(page.getByLabel('Datum')).toHaveValue(isoDaysFromToday(0));
  await page.getByRole('button', { name: 'Spara', exact: true }).tap();
  await expect(page.getByTestId('entry')).toHaveCount(3);
  await expect(page.getByTestId('entry').nth(2)).toContainText('Första veckan');

  // Översikt
  await nav(page).getByRole('link', { name: 'Översikt' }).tap();
  await expect(page.getByTestId('current-weight')).toHaveText('86,0 kg');
  await expect(page.getByTestId('total-change')).toHaveText(/^[−-]4,0 kg$/);
  await expect(page.getByTestId('remaining')).toHaveText('6,0 kg');
  await expect(page.getByTestId('bmi')).toHaveText('26,5 (Övervikt)');
  await expect(page.getByRole('progressbar', { name: 'Framsteg mot målvikten' })).toHaveAttribute(
    'aria-valuenow',
    '40',
  );
  // Nyaste veckan först: 86, 87, 88 och en tom vecka.
  const weekRows = page.getByTestId('weekly-averages').locator('tbody tr');
  await expect(weekRows).toHaveCount(4);
  await expect(weekRows.nth(0)).toContainText('86,0 kg');
  await expect(weekRows.nth(1)).toContainText('87,0 kg');
  await expect(weekRows.nth(2)).toContainText('88,0 kg');
  await expect(weekRows.nth(3)).toContainText('–');
  // −1 kg/vecka, 6 kg kvar → 42 dagar.
  await expect(page.getByTestId('forecast')).toContainText(/[−-]1,0 kg\/vecka/);
  await expect(page.getByTestId('forecast')).toContainText('når du målet omkring');

  // Historik: graf med tre punkter, trend och mål + lista.
  await nav(page).getByRole('link', { name: 'Historik' }).tap();
  const chart = page.getByRole('img', { name: /Viktgraf/ });
  await expect(chart.locator('canvas')).toBeVisible();
  await expect(chart).toHaveAttribute('data-points', '3');
  await expect(chart.locator('.u-legend')).toContainText('Daglig vikt');
  await expect(chart.locator('.u-legend')).toContainText('Trend');
  await expect(chart.locator('.u-legend')).toContainText('Mål');
  await expect(page.getByTestId('history-table').locator('tbody tr')).toHaveCount(3);

  const oneMonth = page.getByRole('button', { name: '1 mån' });
  await oneMonth.tap();
  await expect(oneMonth).toHaveAttribute('aria-pressed', 'true');
  await expect(chart).toHaveAttribute('data-points', '3');

  expect(errors).toEqual([]);
});

test('viktfältet är förifyllt med senast loggade vikt', async ({ page }) => {
  await page.goto('./');
  await seed(page, {
    profile: {
      startDate: isoDaysFromToday(-30),
      startWeightKg: 95,
      heightCm: 180,
      goalWeightKg: 80,
    },
    weights: [
      { id: 'a', date: isoDaysFromToday(-3), weightKg: 88.4, createdAt: 1 },
      { id: 'b', date: isoDaysFromToday(-1), weightKg: 87.9, createdAt: 2 },
      { id: 'c', date: isoDaysFromToday(-1), weightKg: 87.6, createdAt: 3 },
      { id: 'd', date: isoDaysFromToday(-10), weightKg: 90.1, createdAt: 4 },
    ],
  });
  await page.goto('./#/logga');
  await expect(page.getByLabel('Vikt (kg)')).toHaveValue('87,6');

  // En efterregistrering av en äldre dag ändrar inte vad som är senast.
  await logWeight(page, isoDaysFromToday(-20), '91,5');
  await expect(page.getByLabel('Vikt (kg)')).toHaveValue('87,6');

  // Efter Midja och tillbaka är vikten fortfarande förifylld.
  await page.getByRole('button', { name: 'Midja', exact: true }).tap();
  await page.getByRole('button', { name: 'Vikt', exact: true }).tap();
  await expect(page.getByLabel('Vikt (kg)')).toHaveValue('87,6');
});

test('redigera och ta bort en vikt', async ({ page }) => {
  await page.goto('./#/logga');
  await logWeight(page, isoDaysFromToday(-1), '80,5');
  await expect(page.getByTestId('entry')).toHaveCount(1);

  await page.getByRole('button', { name: /^Redigera/ }).tap();
  await expect(page.getByRole('heading', { name: 'Redigera vikt' })).toBeVisible();
  await expect(page.getByLabel('Vikt (kg)')).toHaveValue('80,5');
  await page.getByLabel('Vikt (kg)').fill('80,1');
  await page.getByRole('button', { name: 'Spara ändringar' }).tap();
  await expect(page.getByTestId('entry')).toHaveCount(1);
  await expect(page.getByTestId('entry')).toContainText('80,1 kg');

  await page.getByRole('button', { name: /^Ta bort/ }).tap();
  await page.getByRole('button', { name: /^Bekräfta borttagning/ }).tap();
  await expect(page.getByTestId('entry')).toHaveCount(0);
  await expect(page.getByText('Inga mätningar ännu.')).toBeVisible();
});

test('logga midja', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./#/logga');
  const waistTab = page.getByRole('button', { name: 'Midja', exact: true });
  await waistTab.tap();
  await expect(waistTab).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Inga midjemått ännu.')).toBeVisible();

  const field = page.getByLabel('Midjemått (cm)');
  await expect(field).toHaveValue('');
  await page.getByLabel('Datum').fill(isoDaysFromToday(-7));
  await field.fill('96,5');
  await page.getByRole('button', { name: 'Spara', exact: true }).tap();
  await expect(page.getByRole('status')).toContainText('Sparade 96,5 cm');
  // Förifyllt med senaste måttet.
  await expect(field).toHaveValue('96,5');

  await page.getByLabel('Datum').fill(isoDaysFromToday(0));
  await field.fill('95');
  await page.getByRole('button', { name: 'Spara', exact: true }).tap();
  await expect(page.getByRole('status')).toContainText('Sparade 95 cm');

  // Samma dag igen skriver över.
  await expect(page.getByTestId('waist-existing')).toContainText('95 cm är redan loggat');
  await field.fill('94,5');
  await page.getByRole('button', { name: 'Spara', exact: true }).tap();
  await expect(page.getByRole('status')).toContainText('Uppdaterade 94,5 cm');

  const entries = page.getByTestId('waist-entry');
  await expect(entries).toHaveCount(2);
  await expect(entries.nth(0)).toContainText('94,5 cm');
  await expect(entries.nth(1)).toContainText('96,5 cm');

  const stored = await dump(page);
  expect(stored.waist).toEqual([
    expect.objectContaining({ date: isoDaysFromToday(-7), waistCm: 96.5 }),
    expect.objectContaining({ date: isoDaysFromToday(0), waistCm: 94.5 }),
  ]);
  // Midjan påverkar inte vikterna.
  expect(stored.weights).toEqual([]);

  // Ogiltigt värde.
  await field.fill('5');
  await page.getByRole('button', { name: 'Spara', exact: true }).tap();
  await expect(page.getByRole('alert')).toHaveText('Ange midjemått i cm (30–300).');
  expect(errors).toEqual([]);
});

test('logga steg och skriv över dagens steg', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./#/logga');
  const stepsTab = page.getByRole('button', { name: 'Steg', exact: true });
  await stepsTab.tap();
  await expect(stepsTab).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Dagens steg' })).toBeVisible();
  await expect(page.getByLabel('Datum')).toHaveValue(isoDaysFromToday(0));
  const field = page.getByLabel('Antal steg');
  await expect(field).toHaveAttribute('inputmode', 'numeric');
  await expect(field).toHaveValue('');
  await expect(page.getByTestId('steps-existing')).toHaveText('Inget loggat för dagen ännu.');
  await expect(page.getByText('Inga steg loggade ännu.')).toBeVisible();

  await logSteps(page, '8000');
  await expect(page.getByRole('status')).toContainText('Sparade 8 000 steg');
  const chart = page.getByRole('img', { name: 'Stapelgraf med steg per dag' });
  await expect(chart.locator('canvas')).toBeVisible();
  await expect(chart).toHaveAttribute('data-bars', '1');

  // Tillbaka senare samma dag: befintligt värde visas.
  await page.reload();
  await stepsTab.tap();
  await expect(field).toHaveValue('8000');
  await expect(page.getByTestId('steps-existing')).toContainText('Loggat för dagen: 8 000 steg');

  await logSteps(page, '10 500');
  await expect(page.getByRole('status')).toContainText('Uppdaterade 10 500 steg');
  await expect(chart).toHaveAttribute('data-bars', '1');
  await expect(page.getByTestId('steps-average')).toHaveText('Snitt 10 500 steg per loggad dag.');

  // En annan dag.
  await page.getByLabel('Datum').fill(isoDaysFromToday(-1));
  await expect(field).toHaveValue('');
  await logSteps(page, '6000');
  await expect(page.getByRole('status')).toContainText('Sparade 6 000 steg');
  await expect(chart).toHaveAttribute('data-bars', '2');
  await expect(page.getByTestId('steps-average')).toHaveText('Snitt 8 250 steg per loggad dag.');

  const stored = await dump(page);
  expect(stored.steps).toEqual([
    expect.objectContaining({ date: isoDaysFromToday(-1), steps: 6000 }),
    expect.objectContaining({ date: isoDaysFromToday(0), steps: 10500 }),
  ]);

  await logSteps(page, '1,5');
  await expect(page.getByRole('alert')).toHaveText('Ange steg som ett heltal (0–200 000).');
  expect(errors).toEqual([]);
});
