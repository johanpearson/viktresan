import { expect, test, type Page } from '@playwright/test';

/** Lokalt datum ± dagar som YYYY-MM-DD, samma som appens todayIso(). */
function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function logWeight(page: Page, date: string, weight: string, steps?: string) {
  await page.getByLabel('Datum').fill(date);
  await page.getByLabel('Vikt (kg)').fill(weight);
  if (steps) {
    await page.getByText('Midjemått, steg och anteckning').tap();
    await page.getByLabel('Steg').fill(steps);
  }
  await page.getByRole('button', { name: 'Spara', exact: true }).tap();
  const kg = `${weight.includes(',') ? weight : `${weight},0`} kg`;
  await expect(page.getByRole('status')).toContainText(`Sparade ${kg}`);
}

test('fyll profil, logga tre vikter och se översikt och graf', async ({ page }) => {
  const errors = collectErrors(page);

  // Profil
  await page.goto('./#/installningar');
  await page.getByLabel('Startdatum').fill(isoDaysFromToday(-21));
  await page.getByLabel('Startvikt (kg)').fill('90');
  await page.getByLabel('Längd (cm)').fill('180');
  await page.getByLabel('Målvikt (kg)').fill('80');
  await page.getByRole('button', { name: 'Spara profil' }).tap();
  await expect(page.getByText('Profilen är sparad.')).toBeVisible();

  // Logga: förifyllt med startvikten, sedan med senast loggade värde.
  await page.goto('./#/logga');
  await expect(page.getByLabel('Vikt (kg)')).toHaveValue('90,0');
  await logWeight(page, isoDaysFromToday(-14), '88', '8000');
  await expect(page.getByLabel('Vikt (kg)')).toHaveValue('88,0');
  await logWeight(page, isoDaysFromToday(-7), '87,0', '10500');

  // Tredje vikten via +/- 0,1-knapparna: 86,2 → 86,1 → 86,0 → 86,1 → 86,0
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

  // Översikt
  await page
    .getByRole('navigation', { name: 'Huvudmeny' })
    .getByRole('link', { name: 'Översikt' })
    .tap();
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
  await page
    .getByRole('navigation', { name: 'Huvudmeny' })
    .getByRole('link', { name: 'Historik' })
    .tap();
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

  // Steg: två dagar med steg.
  await page
    .getByRole('navigation', { name: 'Huvudmeny' })
    .getByRole('link', { name: 'Steg' })
    .tap();
  const steps = page.getByRole('img', { name: 'Stapelgraf med steg per dag' });
  await expect(steps.locator('canvas')).toBeVisible();
  await expect(steps).toHaveAttribute('data-bars', '2');
  await expect(page.getByTestId('steps-average')).toHaveText('Snitt 9 250 steg per loggad dag.');

  expect(errors).toEqual([]);
});

test('redigera och ta bort en mätning', async ({ page }) => {
  await page.goto('./#/logga');
  await logWeight(page, isoDaysFromToday(-1), '80,5');
  await expect(page.getByTestId('entry')).toHaveCount(1);

  await page.getByRole('button', { name: /^Redigera/ }).tap();
  await expect(page.getByRole('heading', { name: 'Redigera mätning' })).toBeVisible();
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
