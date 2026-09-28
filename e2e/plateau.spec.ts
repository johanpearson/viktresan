import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, seed, type SeedData } from './helpers.ts';

/**
 * Platåkortet på Översikt: trendvikten har stått still i tre veckor. Tiden fryses till
 * måndag 28 sep 2026 kl. 09:00.
 */

const NOW = '2026-09-28T09:00:00+02:00';
const TODAY = '2026-09-28';

test.use({ serviceWorkers: 'block', locale: 'sv-SE', timezoneId: 'Europe/Stockholm' });

function daysAgo(days: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const at = (days: number) => Date.parse(NOW) - days * 864e5;

/** Vikt: ner 0,1 kg/dag i 30 dagar, sedan stilla (±0,2 kg) i 45 dagar. */
function data(rate: number): SeedData {
  const weights = Array.from({ length: 76 }, (_, k) => {
    const days = 75 - k;
    const base = days > 45 ? 88 + (days - 45) * 0.1 : 88;
    return {
      id: `w${String(k)}`,
      date: daysAgo(days),
      weightKg: Math.round((base + ((k * 7) % 5) * 0.1 - 0.2) * 10) / 10,
      createdAt: at(days),
    };
  });
  // Mat: 1 700 kcal de tre veckorna innan, 2 000 kcal de senaste tre.
  const foodLog = Array.from({ length: 42 }, (_, k) => {
    const days = 42 - k;
    const kcal = days > 21 ? 1700 : 2000;
    return {
      id: `f${String(k)}`,
      date: daysAgo(days),
      meal: 'lunch',
      foodId: 'egen:mat',
      name: 'Mat',
      amount: 100,
      unit: 'g',
      grams: 100,
      per100: { kcal, proteinG: 100, carbsG: 0, fatG: 0 },
      createdAt: at(days),
    };
  });
  return {
    profile: {
      startDate: daysAgo(80),
      startWeightKg: 91,
      heightCm: 172,
      goalWeightKg: 78,
      sex: 'kvinna',
      birthYear: 1980,
      activityLevel: 'latt',
      ratePerWeekKg: rate,
    },
    weights,
    foodLog,
    settings: { lastExportAt: at(1) },
  };
}

async function open(page: Page, seedData: SeedData) {
  await page.clock.setFixedTime(new Date(NOW));
  await page.goto('./');
  await seed(page, seedData);
  await page.reload();
  await expect(page.getByTestId('hero')).toBeVisible();
}

test('platå: kortet jämför perioderna, Fråga AI och Stäng', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, data(0.5));
  const card = page.getByTestId('plateau-card');
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading', { name: 'Trendvikten står still' })).toBeVisible();
  await expect(card.getByTestId('plateau-row').filter({ hasText: 'Snittintag' })).toContainText(
    '2 000 kcal',
  );
  await expect(card.getByTestId('plateau-reasons').locator('[data-id="intag-upp"]')).toContainText(
    '300 kcal högre',
  );
  await expect(card).toContainText('mätbrus');
  const axe = await new AxeBuilder({ page })
    .include('[data-testid="plateau-card"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await card.getByRole('button', { name: 'Fråga AI om platån' }).tap();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByTestId('ai-prompt')).toHaveValue(/förstå min viktplatå/);
  await expect(sheet.getByTestId('ai-prompt')).toHaveValue(/- Snittintag: 2 000 kcal/);
  await expect(sheet.getByRole('switch', { name: 'Platåanalysen' })).toBeChecked();
  await sheet.getByRole('button', { name: 'Stäng', exact: true }).tap();
  await expect(sheet).toBeHidden();

  await card.getByRole('button', { name: 'Stäng platåkortet' }).tap();
  await expect(card).toBeHidden();
  await page.reload();
  await expect(page.getByTestId('hero')).toBeVisible();
  await expect(page.getByTestId('plateau-card')).toHaveCount(0);

  // 14 dagar senare (platån håller i sig) visas kortet igen.
  await page.clock.setFixedTime(new Date(Date.parse(NOW) + 14 * 864e5));
  await seed(page, {
    weights: Array.from({ length: 14 }, (_, i) => ({
      id: `n${String(i)}`,
      date: new Date(Date.parse(`${TODAY}T12:00:00Z`) + (i + 1) * 864e5).toISOString().slice(0, 10),
      weightKg: 88,
      createdAt: at(-(i + 1)),
    })),
  });
  await page.reload();
  await expect(page.getByTestId('plateau-card')).toBeVisible();
  expect(errors).toEqual([]);
});

test('ingen platåvarning i viktstabiliseringsläget', async ({ page }) => {
  await open(page, data(0));
  await expect(page.getByTestId('trend-weight')).toBeVisible();
  await expect(page.getByTestId('plateau-card')).toHaveCount(0);
});
