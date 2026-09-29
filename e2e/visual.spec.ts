import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectErrors, seed } from './helpers.ts';
import {
  FROZEN_NOW,
  LIVSMEDEL,
  MEAL_HEADERS,
  TODAY,
  VISUAL_DATA,
  WEEKLY_EXTRA,
  WORST_CASE_RINGS,
} from './visualData.ts';

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

// Bygg-info och lagringsstatus skiljer sig mellan byggen och maskiner. I en panel maskas
// bara panelens innehåll – masker ritas annars ovanpå panelen för element bakom den.
function masks(scope: Page | Locator): Locator[] {
  return [
    scope.getByTestId('app-version'),
    scope.getByTestId('app-commit'),
    scope.getByTestId('app-build-time'),
    scope.getByTestId('persistence-status'),
    scope.getByTestId('persistence-summary'),
    scope.getByTestId('storage-usage'),
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
    mask: masks(fullPage ? page : page.getByRole('dialog').last()),
    // Liten marginal för kantutjämning; layoutändringar ger betydligt större skillnader.
    maxDiffPixelRatio: 0.002,
  });
}

/** Två fototillfällen med tre bilder, ritade med canvas i testet (Framsteg → Bilder). */
async function seedPhotos(page: Page) {
  // Enfärgade bilder med en siluett, kodade i samma Chromium som jämför (deterministiskt).
  const [front, side, later] = await page.evaluate(
    (colors) =>
      Promise.all(
        colors.map(async ([bg, fg]) => {
          const canvas = document.createElement('canvas');
          canvas.width = 300;
          canvas.height = 400;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('canvas');
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, 300, 400);
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.ellipse(150, 90, 40, 48, 0, 0, Math.PI * 2);
          ctx.ellipse(150, 280, 80, 130, 0, 0, Math.PI * 2);
          ctx.fill();
          const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, 'image/webp', 0.8);
          });
          if (!blob) throw new Error('toBlob');
          return Array.from(new Uint8Array(await blob.arrayBuffer()));
        }),
      ),
    [
      ['#cbd5e1', '#475569'],
      ['#d6d3d1', '#57534e'],
      ['#bfdbfe', '#1e3a8a'],
    ] as const,
  );
  const photo = (id: string, sessionId: string, date: string, angle: string, bytes?: number[]) => ({
    id,
    sessionId,
    date,
    angle,
    ...(angle === 'profil' ? { side: 'vanster' } : {}),
    width: 300,
    height: 400,
    createdAt: Date.parse(`${date}T08:00:00+02:00`),
    bytes: bytes ?? [],
  });
  await seed(page, {
    photoSessions: [
      {
        id: 's1',
        date: '2026-08-25',
        weightKg: 90.5,
        note: 'Morgon, samma spegel',
        createdAt: Date.parse('2026-08-25T08:00:00+02:00'),
      },
      {
        id: 's2',
        date: '2026-09-22',
        weightKg: 87.6,
        createdAt: Date.parse('2026-09-22T08:00:00+02:00'),
      },
    ],
    photos: [
      photo('p1', 's1', '2026-08-25', 'fram', front),
      photo('p2', 's1', '2026-08-25', 'profil', side),
      photo('p3', 's2', '2026-09-22', 'fram', later),
    ],
  });
  await page.reload();
  await expect(page.getByTestId('photo')).toHaveCount(3);
  await expect
    .poll(() =>
      page.evaluate(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0)),
    )
    .toBe(true);
}

const VIEWS: readonly { name: string; hash: string; heading: string }[] = [
  { name: 'oversikt', hash: '', heading: 'Översikt' },
  { name: 'logga', hash: '#/logga', heading: 'Logga' },
  { name: 'mat-dag', hash: '#/mat', heading: 'Mat' },
  { name: 'mat-naring', hash: '#/mat/naring', heading: 'Mat' },
  { name: 'kalender', hash: '#/kalender', heading: 'Kalender' },
  { name: 'framsteg-historik', hash: '#/framsteg', heading: 'Framsteg' },
  { name: 'framsteg-veckor', hash: '#/framsteg/veckor', heading: 'Framsteg' },
  { name: 'framsteg-bilder', hash: '#/framsteg/bilder', heading: 'Framsteg' },
  { name: 'framsteg-milstolpar', hash: '#/framsteg/milstolpar', heading: 'Framsteg' },
  { name: 'installningar', hash: '#/installningar', heading: 'Inställningar' },
];

const LOG_TILES = ['vikt', 'midja', 'steg', 'vatten', 'traning', 'glp1', 'tillskott'] as const;

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

    test('snabblogg, recept och veckobudget', async ({ page }) => {
      await open(page, '#/mat');
      await seed(page, WEEKLY_EXTRA);
      await page.reload();
      await expect(page.getByTestId('week-line')).toBeVisible();
      await expect(page.getByTestId('estimated-tag')).toBeVisible();
      await shot(page, `${theme}-mat-dag-vecka`);

      const sheet = page.getByRole('dialog');
      const close = () => sheet.getByRole('button', { name: 'Stäng', exact: true }).tap();
      await page.getByRole('button', { name: 'Lägg till i lunch' }).tap();
      await sheet.getByTestId('quick-log-open').getByRole('button').tap();
      await expect(sheet.getByTestId('quick-log-form')).toBeVisible();
      await shot(page, `${theme}-sheet-mat-snabblogg`, false);
      await sheet.getByRole('button', { name: 'Avbryt' }).tap();
      await sheet.getByRole('button', { name: 'Måltider', exact: true }).tap();
      await sheet.getByTestId('quick-pick').filter({ hasText: 'Linsgryta' }).tap();
      await expect(sheet.getByRole('group', { name: 'Snabbval mängd' })).toBeVisible();
      await shot(page, `${theme}-sheet-mat-recept`, false);
      await close();

      await page.getByRole('button', { name: 'Egna', exact: true }).tap();
      await page.getByTestId('own-recipe').getByRole('button').first().tap();
      await expect(page.getByTestId('recipe-per-portion')).toBeVisible();
      await shot(page, `${theme}-mat-recept-formular`);

      await page.goto('./');
      await expect(page.getByTestId('today-card').getByTestId('week-line')).toBeVisible();
      await shot(page, `${theme}-oversikt-vecka`);

      // Tryck på veckoraden: veckans dagar som staplar mot dagsmålet.
      await page.getByTestId('today-card').getByTestId('week-row').tap();
      await expect(sheet.getByTestId('week-sheet')).toBeVisible();
      await shot(page, `${theme}-sheet-vecka`, false);
      await close();

      await page.goto('./#/framsteg/veckor');
      await page.getByTestId('week').first().getByRole('button').tap();
      await expect(sheet.getByTestId('week-budget')).toBeVisible();
      await shot(page, `${theme}-sheet-framsteg-vecka-budget`, false);
    });

    test('vy: framsteg-bilder-galleri', async ({ page }) => {
      await open(page, '#/framsteg/bilder');
      await seedPhotos(page);
      await shot(page, `${theme}-framsteg-bilder-galleri`);
    });

    test('paneler: Bilder – jämförelse och helskärm', async ({ page }) => {
      await open(page, '#/framsteg/bilder');
      await seedPhotos(page);
      await page.getByRole('button', { name: /^Jämför tillfällen/ }).tap();
      const compare = page.getByTestId('photo-compare');
      await expect(compare.getByTestId('compare-summary')).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0)),
        )
        .toBe(true);
      await shot(page, `${theme}-bilder-jamfor`, false);
      const sheet = page.getByRole('dialog');
      await sheet.getByRole('button', { name: 'Stäng', exact: true }).tap();
      await expect(sheet).toBeHidden();
      await page.getByTestId('photo').first().tap();
      const viewer = page.getByRole('dialog');
      await expect(viewer).toBeVisible();
      await expect
        .poll(() => viewer.locator('img').evaluate((i) => (i as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
      await shot(page, `${theme}-bilder-helskarm`, false);
    });

    test('vy: kalender-vecka', async ({ page }) => {
      await open(page, '#/kalender');
      await page.getByRole('button', { name: 'Vecka', exact: true }).tap();
      // Förklaringen är hopfälld; här utfälld så att den också jämförs. Fälls ut utan tryck –
      // ett tryck scrollar sidan och den sticky rubriken hamnar mitt i helsidesbilden.
      await page.getByTestId('calendar-legend').evaluate((el) => {
        (el as HTMLDetailsElement).open = true;
      });
      await shot(page, `${theme}-kalender-vecka`);
      // Radmenyn för ett pass i dagsvyn.
      await page
        .getByTestId('calendar-day')
        .getByTestId('workout')
        .first()
        .getByRole('button')
        .tap();
      await expect(page.getByRole('dialog')).toBeVisible();
      await shot(page, `${theme}-sheet-kalender-pass`, false);
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

    test('paneler: val i Logga och Fråga AI', async ({ page }) => {
      await open(page, '#/logga');
      const sheet = page.getByRole('dialog');
      const close = () => sheet.getByRole('button', { name: 'Stäng', exact: true }).tap();
      const scrollTo = (name: string) =>
        sheet.getByText(name, { exact: true }).evaluate((el) => {
          el.scrollIntoView({ block: 'center' });
        });

      // Veckodagar i ett nytt schema.
      await page.getByTestId('log-tile-traning').tap();
      await sheet.getByRole('button', { name: 'Återkommande' }).tap();
      await scrollTo('Veckodagar');
      await shot(page, `${theme}-sheet-logga-schema`, false);
      await close();
      await expect(sheet).toBeHidden();

      // GLP-1: mående (aptit, biverkningar) och läkemedel (hur ofta).
      await page.getByTestId('log-tile-glp1').tap();
      await sheet.getByRole('button', { name: 'Mående', exact: true }).tap();
      await shot(page, `${theme}-sheet-logga-maende`, false);
      await sheet.getByRole('button', { name: 'Läkemedel', exact: true }).tap();
      await scrollTo('Hur ofta');
      await shot(page, `${theme}-sheet-logga-lakemedel`, false);
      await close();
      await expect(sheet).toBeHidden();

      // Fråga AI (helskärm) från analysen av lunchen – överst och scrollad.
      await page.goto('./#/mat');
      await page.getByRole('button', { name: 'Fler val för lunch' }).tap();
      await sheet.getByRole('button', { name: 'Analysera' }).tap();
      await sheet.getByRole('button', { name: 'Fråga AI' }).tap();
      await expect(sheet.getByTestId('ask-ai')).toBeVisible();
      await sheet.evaluate((el) => {
        el.scrollTop = 0;
      });
      await shot(page, `${theme}-sheet-fraga-ai`, false);
      await sheet.evaluate((el) => {
        el.scrollTop = 240;
      });
      await shot(page, `${theme}-sheet-fraga-ai-scrollad`, false);
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

    test('paneler: Tillskott, skanner, ingen träff och AI-import', async ({ page }) => {
      // Låtsaskamera med ficklampa och zoom; en mörk, stillastående bild (deterministisk).
      await page.addInitScript(() => {
        class FakeBarcodeDetector {
          detect() {
            return Promise.resolve([]);
          }
        }
        Object.defineProperty(window, 'BarcodeDetector', { value: FakeBarcodeDetector });
        Object.defineProperty(navigator, 'mediaDevices', {
          value: {
            getUserMedia: () => {
              const canvas = document.createElement('canvas');
              canvas.width = 320;
              canvas.height = 240;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.fillStyle = '#111';
                ctx.fillRect(0, 0, 320, 240);
              }
              const stream = canvas.captureStream(5);
              const track = stream.getVideoTracks()[0];
              if (track) {
                track.getCapabilities = () =>
                  ({
                    torch: true,
                    zoom: { min: 1, max: 4, step: 0.5 },
                  }) as unknown as MediaTrackCapabilities;
                track.applyConstraints = () => Promise.resolve();
              }
              return Promise.resolve(stream);
            },
          },
        });
      });
      await page.route('https://world.openfoodfacts.org/**', (route) =>
        route.fulfill({
          status: 404,
          headers: { 'Access-Control-Allow-Origin': '*' },
          json: { status: 0 },
        }),
      );
      await open(page, '#/logga/tillskott');
      const sheet = page.getByRole('dialog', { name: 'Tillskott' });
      await expect(sheet).toBeVisible();
      await sheet.getByTestId('supplement').filter({ hasText: 'Magnesium' }).tap();
      await expect(sheet.getByTestId('supplement-form')).toBeVisible();
      await shot(page, `${theme}-sheet-tillskott-formular`, false);
      await sheet.getByRole('button', { name: 'Avbryt' }).tap();

      await sheet.getByRole('button', { name: /^Skanna streckkod/ }).tap();
      const scanner = page.getByTestId('scanner');
      await expect(scanner.getByTestId('scanner-dark')).toBeVisible();
      await shot(page, `${theme}-skanner`, false);
      await scanner.getByRole('button', { name: 'Skriv in streckkod' }).tap();
      await scanner.getByLabel('Streckkod (EAN)').fill('4006381333931');
      await shot(page, `${theme}-skanner-manuell`, false);
      await scanner.getByRole('button', { name: 'Slå upp' }).tap();
      await expect(sheet.getByTestId('ean-not-found')).toBeVisible();
      await sheet.evaluate((el) => {
        el.scrollTop = 0;
      });
      await shot(page, `${theme}-sheet-tillskott-hittade-inte`, false);
      await sheet
        .getByTestId('ean-not-found')
        .getByRole('button', { name: /^Lägg in med AI/ })
        .tap();
      await expect(sheet.getByTestId('ai-label')).toBeVisible();
      await sheet
        .getByLabel('AI-tjänstens svar (JSON)')
        .fill(
          '{"namn":"Multi Vuxen","enhet":"tablett","mangdPerDos":1,"naringsamnen":[{"amne":"vitaminD","mangd":10,"enhet":"µg"},{"amne":"zinc","mangd":10,"enhet":"mg"}]}',
        );
      await sheet.getByRole('button', { name: 'Granska svaret' }).tap();
      await expect(sheet.getByTestId('ai-label-preview')).toBeVisible();
      await sheet.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await shot(page, `${theme}-sheet-tillskott-ai`, false);
    });

    test('paneler: Inställningar', async ({ page }) => {
      await open(page, '#/installningar');
      const sheet = page.getByRole('dialog');
      for (const id of ['profil', 'funktioner', 'sakerhetskopia'] as const) {
        await page.getByTestId(`settings-${id}`).getByRole('button').tap();
        await expect(sheet).toBeVisible();
        await shot(page, `${theme}-sheet-installningar-${id}`, false);
        await sheet.getByRole('button', { name: 'Stäng', exact: true }).tap();
        await expect(sheet).toBeHidden();
      }
    });

    test('paneler: Inställningar – val', async ({ page }) => {
      await open(page, '#/installningar/profil');
      const sheet = page.getByRole('dialog');
      // Aktivitetsnivån ligger under första skärmen i profilpanelen.
      await sheet.getByRole('group', { name: 'Aktivitetsnivå' }).evaluate((el) => {
        el.scrollIntoView({ block: 'end' });
      });
      await shot(page, `${theme}-sheet-installningar-aktivitet`, false);
      await sheet.getByRole('button', { name: 'Stäng', exact: true }).tap();
      await expect(sheet).toBeHidden();

      await page.getByTestId('settings-bilder').getByRole('button').tap();
      await expect(sheet).toBeVisible();
      await shot(page, `${theme}-sheet-installningar-bilder`, false);
      await sheet.getByRole('button', { name: 'Stäng', exact: true }).tap();
      await expect(sheet).toBeHidden();

      // Förhandsvisningen av en säkerhetskopia (exporterad från samma data).
      await page.getByTestId('settings-sakerhetskopia').getByRole('button').tap();
      const download = page.waitForEvent('download');
      await sheet.getByRole('button', { name: 'Exportera säkerhetskopia' }).tap();
      const path = await (await download).path();
      await sheet.getByLabel('Välj säkerhetskopia').setInputFiles(path);
      const preview = sheet.getByTestId('import-preview');
      await expect(preview).toBeVisible();
      await preview.getByText('Hur ska datan importeras?').scrollIntoViewIfNeeded();
      await shot(page, `${theme}-sheet-installningar-import`, false);
    });

    test('rapport: val, skärmvy och utskrift (A4)', async ({ page }) => {
      await open(page, '#/framsteg/rapport');
      await expect(page.getByTestId('report-settings')).toBeVisible();
      await shot(page, `${theme}-framsteg-rapport`);
      await page.getByRole('link', { name: 'Visa rapport' }).tap();
      await expect(page.getByTestId('report')).toBeVisible();
      await shot(page, `${theme}-rapport`);
      // Utskriftsvyn: A4-bredd (210 mm vid 96 dpi), alltid ljust tema.
      await page.setViewportSize({ width: 794, height: 1123 });
      await page.emulateMedia({ media: 'print' });
      await expect(page.locator('.nav')).toBeHidden();
      await expect(page).toHaveScreenshot(`${theme}-rapport-utskrift.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.002,
      });
    });

    test('ringar: värsta fallet på Pixel 7 och 360 px', async ({ page }) => {
      // Långa värden i alla fyra ringar samtidigt; egen databas (inte VISUAL_DATA).
      await page.clock.setFixedTime(new Date(FROZEN_NOW));
      await page.goto('./');
      await seed(page, WORST_CASE_RINGS);
      await page.reload();
      await page.evaluate(() => document.fonts.ready);
      const card = page.getByTestId('today-card');
      await expect(card.locator('.goal-ring')).toHaveCount(4);
      await expect(card).toHaveScreenshot(`${theme}-ringar-pixel7.png`, {
        maxDiffPixelRatio: 0.002,
      });
      await page.setViewportSize({ width: 360, height: 800 });
      await expect(card).toHaveScreenshot(`${theme}-ringar-360.png`, { maxDiffPixelRatio: 0.002 });
    });

    test('måltidsrubriker: långa och korta namn och kcal på Pixel 7 och 360 px', async ({
      page,
    }) => {
      // Mellanmål 12 poster 1 234 kcal, Lunch 85 kcal, tom Middag; egen databas (inte VISUAL_DATA).
      await page.clock.setFixedTime(new Date(FROZEN_NOW));
      await page.route('**/livsmedel.json', (route) => route.fulfill({ json: LIVSMEDEL }));
      await page.goto('./');
      await seed(page, MEAL_HEADERS);
      await page.goto('./#/mat');
      await page.reload();
      const sections = page.locator('.meal-sections');
      await expect(page.getByTestId('meal-mellanmal').getByTestId('meal-kcal')).toHaveText(
        '1 234 kcal',
      );
      await expect(page.getByTestId('meal-mellanmal').getByTestId('fiber')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await shot(page, `${theme}-mat-maltider-pixel7`);
      await page.setViewportSize({ width: 360, height: 800 });
      await expect(sections).toHaveScreenshot(`${theme}-mat-maltider-360.png`, {
        maxDiffPixelRatio: 0.002,
      });
      // Summeringen med veckoraden och fiberförklaringen utfälld (info-ikonen).
      await page.getByTestId('macros').getByRole('button', { name: 'Om fibervärdet' }).tap();
      await expect(page.getByTestId('fiber-incomplete')).toBeVisible();
      await expect(page.locator('.day-summary')).toHaveScreenshot(
        `${theme}-mat-summering-360.png`,
        { maxDiffPixelRatio: 0.002 },
      );
    });

    test('fibermål och dryck med GLP-1', async ({ page }) => {
      // Diarré loggad idag → påminnelsen om att dricka extra överst på Översikt.
      await open(page, '');
      await seed(page, {
        symptoms: [{ date: TODAY, sideEffects: ['Diarré'], createdAt: Date.parse(FROZEN_NOW) }],
      });
      await page.reload();
      await expect(page.getByTestId('hydration-reminder')).toBeVisible();
      await expect(page.getByTestId('fiber-ring')).toBeVisible();
      await shot(page, `${theme}-oversikt-glp1`, false);

      const sheet = page.getByRole('dialog');
      for (const id of ['fiber', 'dryck'] as const) {
        await page.goto(`./#/installningar/${id}`);
        await expect(sheet).toBeVisible();
        await shot(page, `${theme}-sheet-installningar-${id}`, false);
        await sheet.getByRole('button', { name: 'Stäng', exact: true }).tap();
        await expect(sheet).toBeHidden();
      }
    });

    test('paneler: Översikt och Framsteg', async ({ page }) => {
      await open(page, '');
      const sheet = page.getByRole('dialog');
      // Tryck på passet i Att göra idag: radmenyn, sedan Klar.
      await page.getByTestId('todo-workout').getByRole('button').tap();
      await expect(sheet).toBeVisible();
      await shot(page, `${theme}-sheet-pass-meny`, false);
      await sheet.getByRole('button', { name: 'Klar' }).tap();
      await expect(sheet).toHaveAccessibleName('Markera som klar');
      await expect(sheet).toBeVisible();
      await shot(page, `${theme}-sheet-klar`, false);
      await sheet.getByRole('button', { name: 'Stäng', exact: true }).tap();
      await expect(sheet).toBeHidden();

      // Ringarna: dryck och kalorier öppnar var sin panel.
      await page.getByRole('button', { name: 'Dryck – logga dryck' }).tap();
      await expect(sheet).toBeVisible();
      await shot(page, `${theme}-sheet-dryck-idag`, false);
      await sheet.getByRole('button', { name: 'Stäng', exact: true }).tap();
      await expect(sheet).toBeHidden();
      await page.getByRole('button', { name: 'Kalorier – visa kalorimålet' }).tap();
      await expect(sheet).toBeVisible();
      await shot(page, `${theme}-sheet-kalorimal`, false);
      await sheet.getByRole('button', { name: 'Stäng', exact: true }).tap();
      await expect(sheet).toBeHidden();

      await page.goto('./#/installningar/oversikt');
      await expect(sheet).toBeVisible();
      await shot(page, `${theme}-sheet-installningar-oversikt`, false);
      await sheet.getByRole('button', { name: 'Stäng', exact: true }).tap();
      await expect(sheet).toBeHidden();

      await page.goto('./#/framsteg/bilder');
      await page.getByRole('button', { name: 'Nytt fototillfälle' }).tap();
      await expect(sheet).toBeVisible();
      await shot(page, `${theme}-sheet-fototillfalle`, false);
      await sheet.getByRole('button', { name: 'Stäng', exact: true }).tap();
      await expect(sheet).toBeHidden();

      // Framsteg → Veckor: tryck på en vecka öppnar hela summeringen.
      await page.getByRole('button', { name: 'Veckor', exact: true }).tap();
      await page.getByTestId('week').first().getByRole('button').tap();
      await expect(sheet).toBeVisible();
      await shot(page, `${theme}-sheet-framsteg-vecka`, false);
    });
  });
}
