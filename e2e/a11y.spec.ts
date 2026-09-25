import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { isoDaysFromToday, seed } from './helpers.ts';

const ROUTES = [
  ['Översikt', './'],
  ['Logga', './#/logga'],
  ['Historik', './#/historik'],
  ['Steg', './#/steg'],
  ['Bilder', './#/bilder'],
  ['Inställningar', './#/installningar'],
] as const;

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function expectNoViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => n.target.join(' ')),
  }));
  expect(summary, label).toEqual([]);
}

async function seedData(page: Page) {
  await page.goto('./');
  await seed(page, {
    profile: {
      startDate: isoDaysFromToday(-30),
      startWeightKg: 90,
      heightCm: 180,
      goalWeightKg: 80,
    },
    weights: [
      { id: 'a', date: isoDaysFromToday(-20), weightKg: 89, createdAt: Date.now() - 20 * 864e5 },
      { id: 'b', date: isoDaysFromToday(-10), weightKg: 88, createdAt: Date.now() - 10 * 864e5 },
      { id: 'c', date: isoDaysFromToday(0), weightKg: 87, note: 'Bra dag', createdAt: Date.now() },
    ],
    waist: [{ date: isoDaysFromToday(0), waistCm: 94, createdAt: Date.now() }],
    steps: [
      { date: isoDaysFromToday(-20), steps: 8000, createdAt: Date.now() - 20 * 864e5 },
      { date: isoDaysFromToday(0), steps: 9000, createdAt: Date.now() },
    ],
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} tema`, () => {
    test.use({ colorScheme });

    test('tomma sidor saknar tillgänglighetsfel', async ({ page }) => {
      for (const [label, path] of ROUTES) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
        await expectNoViolations(page, label);
      }
    });

    test('sidor med data saknar tillgänglighetsfel', async ({ page }) => {
      await seedData(page);
      for (const [label, path] of ROUTES) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
        await page.waitForLoadState('networkidle');
        await expectNoViolations(page, label);
      }
      // Logga → Midja med data och anteckningsfältet.
      await page.goto('./#/logga');
      await page.getByRole('button', { name: 'Lägg till anteckning' }).tap();
      await expectNoViolations(page, 'Logga vikt med anteckning');
      await page.getByRole('button', { name: 'Midja', exact: true }).tap();
      await expect(page.getByTestId('waist-entry')).toHaveCount(1);
      await expectNoViolations(page, 'Logga midja');
      // Påminnelsen om säkerhetskopia.
      await page.goto('./');
      await expect(page.getByTestId('backup-reminder')).toBeVisible();
      await expectNoViolations(page, 'Påminnelse');
    });

    test('import-förhandsvisning och krypteringsfält saknar tillgänglighetsfel', async ({
      page,
    }) => {
      await seedData(page);
      await page.goto('./#/installningar');
      await page.getByLabel('Kryptera med lösenord').check();
      await expectNoViolations(page, 'Kryptering');

      const download = page.waitForEvent('download');
      await page.getByLabel('Kryptera med lösenord').uncheck();
      await page.getByRole('button', { name: 'Exportera säkerhetskopia' }).tap();
      const path = await (await download).path();
      await page.getByLabel('Välj säkerhetskopia').setInputFiles(path);
      await expect(page.getByTestId('import-preview')).toBeVisible();
      await expectNoViolations(page, 'Förhandsvisning');
    });

    test('låsskärmen saknar tillgänglighetsfel', async ({ page }) => {
      await page.goto('./');
      await seed(page, { settings: { lock: { credentialId: 'AQID', createdAt: 1 } } });
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Viktresan är låst' })).toBeVisible();
      await expectNoViolations(page, 'Låsskärm');
    });
  });
}
