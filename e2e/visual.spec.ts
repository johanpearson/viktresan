import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectErrors, seed } from './helpers.ts';
import { FROZEN_NOW, LIVSMEDEL, VISUAL_DATA } from './visualData.ts';

/**
 * Visuella regressionstester: varje vy och de viktigaste panelerna i ljust och
 * mörkt tema, med fast testdata och fryst datum (se visualData.ts).
 *
 * Baslinjerna skapas i samma Docker-avbild som CI kör (typsnitt och Chromium
 * måste vara identiska):
 *
 *   docker run --rm -v "$PWD":/work -w /work --ipc=host \
 *     mcr.microsoft.com/playwright:v1.63.0-noble \
 *     sh -c 'npm ci && npx playwright test visual --update-snapshots'
 */

test.use({
  // Service workern skulle annars svara på livsmedel.json från sin cache, förbi page.route.
  serviceWorkers: 'block',
  locale: 'sv-SE',
  timezoneId: 'Europe/Stockholm',
});

// Bygg-info och lagringsstatus skiljer sig mellan byggen och maskiner.
function masks(page: Page): Locator[] {
  return [
    page.getByTestId('app-version'),
    page.getByTestId('app-commit'),
    page.getByTestId('app-build-time'),
    page.getByTestId('persistence-status'),
    page.getByTestId('storage-usage'),
  ];
}

async function open(page: Page, hash: string) {
  await page.clock.setFixedTime(new Date(FROZEN_NOW));
  await page.route('**/livsmedel.json', (route) => route.fulfill({ json: LIVSMEDEL }));
  await page.goto('./');
  await seed(page, VISUAL_DATA);
  // Läs om så att funktionsbrytare och inställningar läses från den seedade datan.
  await page.goto(`./${hash}`);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // uPlot ritar efter layout; vänta tills sidan är still.
  await page.evaluate(() => document.fonts.ready);
}

async function shot(page: Page, name: string, fullPage = true) {
  // Helsida: lägg bottennavigeringen sist i flödet i stället för mitt i bilden.
  await page.evaluate((full) => {
    const nav = document.querySelector<HTMLElement>('.nav');
    if (nav) nav.style.position = full ? 'relative' : '';
  }, fullPage);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage,
    mask: masks(page),
    // Liten marginal för kantutjämning; layoutändringar ger betydligt större skillnader.
    maxDiffPixelRatio: 0.002,
  });
}

const VIEWS: readonly { name: string; hash: string; heading: string }[] = [
  { name: 'oversikt', hash: '', heading: 'Översikt' },
  { name: 'logga', hash: '#/logga', heading: 'Logga' },
  { name: 'mat-dag', hash: '#/mat', heading: 'Mat' },
  { name: 'kalender', hash: '#/kalender', heading: 'Kalender' },
  { name: 'framsteg-historik', hash: '#/framsteg', heading: 'Framsteg' },
  { name: 'framsteg-veckor', hash: '#/framsteg/veckor', heading: 'Framsteg' },
  { name: 'framsteg-bilder', hash: '#/framsteg/bilder', heading: 'Framsteg' },
  { name: 'framsteg-milstolpar', hash: '#/framsteg/milstolpar', heading: 'Framsteg' },
  { name: 'installningar', hash: '#/installningar', heading: 'Inställningar' },
];

const LOG_TILES = ['vikt', 'midja', 'steg', 'vatten', 'traning', 'glp1'] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme === 'light' ? 'ljust' : 'mörkt'} tema`, () => {
    test.use({ colorScheme: theme });

    for (const view of VIEWS) {
      test(`vy: ${view.name}`, async ({ page }) => {
        const errors = collectErrors(page);
        await open(page, view.hash);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(view.heading);
        await shot(page, `${theme}-${view.name}`);
        expect(errors).toEqual([]);
      });
    }

    test('vy: mat-egna och mat-historik', async ({ page }) => {
      await open(page, '#/mat');
      await page.getByRole('button', { name: 'Egna', exact: true }).tap();
      await shot(page, `${theme}-mat-egna`);
      await page.getByRole('button', { name: 'Historik', exact: true }).tap();
      await shot(page, `${theme}-mat-historik`);
    });

    test('vy: kalender-vecka', async ({ page }) => {
      await open(page, '#/kalender');
      await page.getByRole('button', { name: 'Vecka', exact: true }).tap();
      await shot(page, `${theme}-kalender-vecka`);
    });

    test('paneler: Logga', async ({ page }) => {
      await open(page, '#/logga');
      for (const type of LOG_TILES) {
        await page.getByTestId(`log-tile-${type}`).tap();
        const sheet = page.getByRole('dialog');
        await expect(sheet).toBeVisible();
        await shot(page, `${theme}-sheet-logga-${type}`, false);
        await sheet.getByRole('button', { name: 'Stäng', exact: true }).tap();
        await expect(sheet).toBeHidden();
      }
    });

    test('paneler: Logga – historik och radmeny', async ({ page }) => {
      await open(page, '#/logga');
      const sheet = page.getByRole('dialog');
      // Tryck på en viktmätning läser in den i formuläret (med "Ta bort mätningen").
      await page.getByTestId('log-tile-vikt').tap();
      await sheet.getByTestId('entry').nth(1).tap();
      await expect(sheet.getByRole('heading', { name: 'Redigera vikt' })).toBeVisible();
      await sheet.evaluate((el) => {
        el.scrollTop = 0;
      });
      await shot(page, `${theme}-sheet-logga-vikt-redigera`, false);
      await sheet.getByRole('button', { name: 'Stäng', exact: true }).tap();
      await expect(sheet).toBeHidden();
      // Radmenyn (ActionSheet) för ett schema ovanpå träningspanelen.
      await page.getByTestId('log-tile-traning').tap();
      await sheet.getByRole('button', { name: 'Återkommande' }).tap();
      await sheet.getByTestId('workout-plan').first().tap();
      await expect(page.getByRole('dialog').nth(1)).toBeVisible();
      await shot(page, `${theme}-sheet-logga-radmeny`, false);
    });

    test('paneler: Mat', async ({ page }) => {
      await open(page, '#/mat');
      const sheet = page.getByRole('dialog');
      const close = () => sheet.getByRole('button', { name: 'Stäng', exact: true }).tap();

      await page.getByRole('button', { name: 'Sök och logga mat' }).tap();
      await expect(sheet).toBeVisible();
      await shot(page, `${theme}-sheet-mat-sok`, false);
      await close();

      await page
        .getByTestId('food-entry')
        .filter({ hasText: 'Potatis' })
        .getByRole('button')
        .first()
        .tap();
      await expect(sheet).toBeVisible();
      await shot(page, `${theme}-sheet-mat-redigera`, false);
      await close();

      await page.getByRole('button', { name: 'Fler val för lunch' }).tap();
      await shot(page, `${theme}-sheet-mat-meny`, false);
      await sheet.getByRole('button', { name: 'Analysera' }).tap();
      await expect(sheet).toHaveAccessibleName(/Analys av lunch/);
      await shot(page, `${theme}-sheet-mat-analys`, false);
      await close();
    });

    test('paneler: Översikt och Framsteg', async ({ page }) => {
      await open(page, '');
      const sheet = page.getByRole('dialog');
      await page.getByRole('button', { name: /^Klar: Styrketräning/ }).tap();
      await expect(sheet).toBeVisible();
      await shot(page, `${theme}-sheet-klar`, false);
      await sheet.getByRole('button', { name: 'Stäng', exact: true }).tap();

      await page.goto('./#/framsteg/bilder');
      await page.getByRole('button', { name: 'Nytt fototillfälle' }).tap();
      await expect(sheet).toBeVisible();
      await shot(page, `${theme}-sheet-fototillfalle`, false);
    });
  });
}
