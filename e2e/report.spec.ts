import { expect, test, type Page } from '@playwright/test';
import { collectErrors, dump, seed } from './helpers.ts';
import { FROZEN_NOW, LIVSMEDEL, VISUAL_DATA } from './visualData.ts';

/**
 * Framsteg → Rapport: period och sektioner, rapportvyn med testdatan från de visuella
 * testerna (fryst datum torsdag 24 sep 2026) och "Spara som PDF" (window.print).
 */

test.use({ serviceWorkers: 'block', locale: 'sv-SE', timezoneId: 'Europe/Stockholm' });

async function openReport(page: Page) {
  await page.clock.setFixedTime(new Date(FROZEN_NOW));
  await page.route('**/livsmedel.json', (route) => route.fulfill({ json: LIVSMEDEL }));
  // Räkna utskrifter i stället för att öppna dialogen.
  await page.addInitScript(() => {
    (window as unknown as { __prints: number }).__prints = 0;
    window.print = () => {
      (window as unknown as { __prints: number }).__prints += 1;
    };
  });
  await page.goto('./');
  await seed(page, VISUAL_DATA);
  await page.goto('./#/framsteg/rapport');
  await page.reload();
  await expect(page.getByTestId('report-settings')).toBeVisible();
}

const prints = (page: Page) =>
  page.evaluate(() => (window as unknown as { __prints: number }).__prints);

test('rapport för 12 veckor med alla sektioner utom bilder', async ({ page }) => {
  const errors = collectErrors(page);
  const external: string[] = [];
  page.on('request', (req) => {
    if (!req.url().startsWith('http://localhost')) external.push(req.url());
  });
  await openReport(page);

  const settings = page.getByTestId('report-settings');
  await settings.getByRole('button', { name: '12 veckor' }).tap();
  await expect(settings.getByRole('button', { name: '12 veckor' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // 12 veckor t.o.m. torsdag 24 sep.
  await expect(page.getByTestId('report-range')).toHaveText('3 juli 2026 – 24 sep. 2026');
  await expect(settings.getByRole('switch', { name: 'Bilder' })).not.toBeChecked();
  await expect(settings.getByRole('switch', { name: 'Viktgraf' })).toBeChecked();

  await settings.getByRole('link', { name: 'Visa rapport' }).tap();
  const report = page.getByTestId('report');
  await expect(report).toBeVisible();
  await expect(page.getByTestId('report-period')).toHaveText('3 juli 2026 – 24 sep. 2026');

  const headings = report.getByRole('heading', { level: 2 });
  await expect(headings).toHaveText([
    'Viktrapport',
    'Grunddata',
    'Vikt',
    'Midjemått',
    'GLP-1',
    'Kost i snitt',
    'Tillskott',
    'Träning',
    'Steg',
  ]);

  // Grunddata: start 92 kg, BMI och förändring i kg och %.
  const basics = page.getByTestId('report-grunddata');
  await expect(basics).toContainText('178 cm');
  await expect(basics).toContainText('92,0 kg');
  await expect(page.getByTestId('report-change')).toHaveText(/^−\d,\d kg \(−\d(,\d)? %\)$/);
  await expect(basics).toContainText('BMI');

  // Grafer som SVG, inte canvas.
  await expect(page.getByTestId('report-weight-chart').locator('svg')).toBeVisible();
  await expect(report.locator('canvas')).toHaveCount(0);
  await expect(report.getByRole('img', { name: /^Vikt .*trendlinje$/ })).toBeVisible();

  // Midja: tre mätningar och förändringen.
  await expect(page.getByTestId('report-midja')).toContainText('−3 cm');
  // GLP-1: dostidslinje, doser och aptit.
  const glp1 = page.getByTestId('report-glp1');
  await expect(glp1).toContainText('Wegovy');
  await expect(page.getByTestId('report-dose-timeline')).toContainText('Wegovy 0,5 mg');
  await expect(page.getByTestId('report-missed')).toHaveText('0');
  await expect(glp1).toContainText('Illamående');
  // Kost: 13 loggade dagar av 84.
  await expect(page.getByTestId('report-food-days')).toHaveText('13 av 84 (15 %)');
  await expect(page.getByTestId('report-kost')).toContainText('Fiber');
  await expect(page.getByTestId('report-tillskott')).toContainText('D-vitamin forte');
  await expect(page.getByTestId('report-traning')).toContainText('Genomförda pass');
  await expect(page.getByTestId('report-steg')).toContainText('Snitt per dag');
  await expect(page.getByTestId('report-bilder')).toHaveCount(0);

  // Utskrift: bara rapporten syns, i ljust tema.
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
  await expect(page.locator('.nav')).toBeHidden();
  await expect(page.getByTestId('report-settings')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Spara som PDF' })).toBeHidden();
  await expect(report).toBeVisible();
  // Ljusa tokens trots mörkt tema: vitt papper och mörk text.
  expect(await report.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgb(255, 255, 255)',
  );
  expect(await page.getByTestId('report-vikt').evaluate((el) => getComputedStyle(el).color)).toBe(
    'rgb(15, 23, 42)',
  );
  await page.emulateMedia({ media: 'screen', colorScheme: null });

  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('Spara som PDF: instruktion första gången, sedan direkt till utskrift', async ({ page }) => {
  await openReport(page);
  await page.getByRole('link', { name: 'Visa rapport' }).tap();
  await page.getByRole('button', { name: 'Spara som PDF' }).tap();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByTestId('print-hint')).toContainText('Spara som PDF');
  expect(await prints(page)).toBe(0);
  await sheet.getByRole('button', { name: 'Fortsätt' }).tap();
  await expect(sheet).toBeHidden();
  expect(await prints(page)).toBe(1);

  // Andra gången (även efter omladdning) öppnas utskriften direkt.
  await page.reload();
  await page.getByRole('button', { name: 'Spara som PDF' }).tap();
  expect(await prints(page)).toBe(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('valen sparas: period och sektioner finns kvar efter omladdning', async ({ page }) => {
  await openReport(page);
  const settings = page.getByTestId('report-settings');
  await settings.getByRole('button', { name: '4 veckor' }).tap();
  await settings.getByRole('switch', { name: 'Steg' }).uncheck();
  await settings.getByRole('switch', { name: 'Bilder' }).check();
  // Vänta tills valen sparats – annars kan omladdningen läsa de gamla värdena.
  await expect
    .poll(async () => (await dump(page)).settings.preferences)
    .toMatchObject({ report: { period: '4v', sections: { steg: false, bilder: true } } });
  await page.reload();
  await expect(settings.getByRole('button', { name: '4 veckor' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(settings.getByRole('switch', { name: 'Steg' })).not.toBeChecked();
  await expect(settings.getByRole('switch', { name: 'Bilder' })).toBeChecked();
  await expect(page.getByTestId('report-range')).toHaveText('28 aug. 2026 – 24 sep. 2026');

  // Egen period: till före från ger ingen rapport.
  await settings.getByRole('button', { name: 'Egen' }).tap();
  await settings.getByLabel('Från', { exact: true }).fill('2026-09-20');
  await settings.getByLabel('Till', { exact: true }).fill('2026-09-10');
  await expect(settings.getByRole('button', { name: 'Visa rapport' })).toBeDisabled();
  await settings.getByLabel('Till', { exact: true }).fill('2026-09-24');
  await settings.getByRole('link', { name: 'Visa rapport' }).tap();
  await expect(page.getByTestId('report-period')).toHaveText('20 sep. 2026 – 24 sep. 2026');
  await expect(page.getByTestId('report-steg')).toHaveCount(0);
  await expect(page.getByTestId('report-bilder')).toContainText('Inga fototillfällen');
});
