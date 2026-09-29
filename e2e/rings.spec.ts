import { expect, test, type Page } from '@playwright/test';
import { collectErrors, seed } from './helpers.ts';
import { FROZEN_NOW, WORST_CASE_RINGS } from './visualData.ts';

/**
 * Ringarna på Översikt → Idag med värsta fallets värden i alla fyra ringar: texten ska ligga inom
 * ringens inre cirkel med marginal, ha samma storlek i alla ringar och aldrig vara under min-storleken.
 */

test.use({ locale: 'sv-SE', timezoneId: 'Europe/Stockholm' });

async function open(page: Page) {
  await page.clock.setFixedTime(new Date(FROZEN_NOW));
  await page.goto('./');
  await seed(page, WORST_CASE_RINGS);
  await page.reload();
  await expect(page.locator('.rings .goal-ring')).toHaveCount(4);
  await page.evaluate(() => document.fonts.ready);
}

interface RingGeometry {
  id: string;
  sizes: number[];
  /** Hur långt utanför den inre cirkeln (minus marginal) textens hörn når, px. ≤ 0 = inuti. */
  overflow: number;
}

/** Varje textrads hörn mot ringens inre cirkel (radie 38 av 96) minus 1 px marginal. */
function measure(page: Page): Promise<RingGeometry[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.rings .goal-ring')].map((ring) => {
      const box = ring.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const radius = (box.width * 38) / 96 - 1;
      const lines = [...ring.querySelectorAll<HTMLElement>('.goal-ring-line')];
      const overflow = Math.max(
        ...lines.map((line) => {
          const r = line.getBoundingClientRect();
          const dx = Math.max(Math.abs(r.left - cx), Math.abs(r.right - cx));
          const dy = Math.max(Math.abs(r.top - cy), Math.abs(r.bottom - cy));
          return Math.hypot(dx, dy) - radius;
        }),
      );
      return {
        id: ring.dataset.testid ?? '',
        sizes: lines.map((l) => parseFloat(getComputedStyle(l).fontSize)),
        overflow,
      };
    }),
  );
}

for (const width of [412, 360]) {
  test(`ringarnas text ryms inom ringen, ${String(width)} px bred skärm`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width, height: 915 });
    await open(page);

    // Värdena: dryck i liter med en decimal, exakta ml för skärmläsare.
    const drink = page.getByTestId('water-ring');
    await expect(drink).toHaveAttribute('aria-valuetext', '2 450 ml av 2 500 ml');
    await expect(drink.locator('.goal-ring-value')).toHaveText('2,5l');
    await expect(drink.locator('.goal-ring-goal')).toHaveText('av 2,5');
    await expect(page.getByTestId('kcal-ring')).toHaveAttribute(
      'aria-valuetext',
      '2 950 av 3 100 kcal',
    );
    await expect(page.getByTestId('protein-ring')).toHaveAttribute(
      'aria-valuetext',
      '188 g av 210 g',
    );
    await expect(page.getByTestId('fiber-ring')).toHaveAttribute('aria-valuetext', '38 g av 35 g');

    // En rad, ingen horisontell scroll.
    const tops = await page
      .locator('.rings .goal-ring')
      .evaluateAll((rings) => rings.map((r) => Math.round(r.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );

    const rings = await measure(page);
    for (const ring of rings) {
      expect(ring.overflow, `${ring.id} går utanför ringen`).toBeLessThanOrEqual(0);
      // Min-storleken: 11 px (--ring-text-min).
      for (const size of ring.sizes) expect(size).toBeGreaterThanOrEqual(11 - 0.01);
    }
    // Samma storlek i alla ringar (värde resp. mål).
    expect(new Set(rings.map((r) => r.sizes[0]?.toFixed(2))).size).toBe(1);
    expect(new Set(rings.map((r) => r.sizes[1]?.toFixed(2))).size).toBe(1);
    // Enheten är mindre än siffran.
    const unit = await drink
      .locator('.goal-ring-unit')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(unit).toBeLessThan(rings[0]?.sizes[0] ?? 0);
    expect(unit).toBeGreaterThanOrEqual(11 - 0.01);

    expect(errors).toEqual([]);
  });
}
