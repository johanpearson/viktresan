import { expect, test, type Page } from '@playwright/test';
import { collectErrors, seed } from './helpers.ts';
import { FROZEN_NOW, LIVSMEDEL, MEAL_HEADERS } from './visualData.ts';

/**
 * Måltidsrubrikerna i Mat → Dag: fast rutnät [pil] [namn + antal] [kcal] [⋯] [+]. Pilen, namnet
 * och kcal står på samma x-position i alla sektioner, och inget i rubrikraden bryts till en ny
 * rad – även med "Mellanmål" + 12 poster + 1 234 kcal på en 360 px bred skärm.
 */

test.use({ locale: 'sv-SE', timezoneId: 'Europe/Stockholm', serviceWorkers: 'block' });

const SLOTS = ['frukost', 'lunch', 'mellanmal'] as const;

async function open(page: Page) {
  await page.clock.setFixedTime(new Date(FROZEN_NOW));
  await page.route('**/livsmedel.json', (route) => route.fulfill({ json: LIVSMEDEL }));
  await page.goto('./');
  await seed(page, MEAL_HEADERS);
  await page.goto('./#/mat');
  await page.reload();
  await expect(page.getByTestId('meal-mellanmal').getByTestId('meal-kcal')).toHaveText(
    '1 234 kcal',
  );
  await page.evaluate(() => document.fonts.ready);
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function box(page: Page, selector: string): Promise<Box> {
  const b = await page.locator(selector).boundingBox();
  if (!b) throw new Error(`Hittade inte ${selector}`);
  return b;
}

for (const width of [412, 360]) {
  test(`pil och kcal står i samma kolumn i alla måltider, ${String(width)} px`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width, height: 915 });
    await open(page);

    const lunch = page.getByTestId('meal-lunch');
    await expect(lunch.getByTestId('meal-kcal')).toHaveText('85 kcal');
    // Makron under 10 g med en decimal, från 10 g hela gram.
    await expect(lunch.getByTestId('meal-macros')).toHaveText(
      'P 15 g · K 4,7 g · F 0,3 g · Fi 0,0 g',
    );
    // Kanelbullen saknar fiberdata: asterisk vid mellanmålets fiber.
    await expect(
      page.getByTestId('meal-mellanmal').getByTestId('meal-macros').getByTestId('fiber-partial'),
    ).toBeVisible();

    const geometry = [];
    for (const slot of SLOTS) {
      const s = `[data-testid="meal-${slot}"]`;
      geometry.push({
        slot,
        chevron: await box(page, `${s} .accordion-chevron`),
        name: await box(page, `${s} .accordion-name`),
        value: await box(page, `${s} .accordion-value`),
        kcal: await box(page, `${s} [data-testid="meal-kcal"]`),
        detail: await box(page, `${s} .accordion-detail`),
        more: await box(page, `${s} .accordion-action:not(.accordion-add)`),
        add: await box(page, `${s} .accordion-add`),
      });
    }
    const [first, ...rest] = geometry;
    if (!first) throw new Error('Inga måltider');
    for (const g of rest) {
      // Samma kolumner i alla sektioner (±0,5 px för subpixelavrundning).
      expect(Math.abs(g.chevron.x - first.chevron.x), `pil ${g.slot}`).toBeLessThan(0.5);
      expect(Math.abs(g.name.x - first.name.x), `namn ${g.slot}`).toBeLessThan(0.5);
      expect(Math.abs(g.value.x - first.value.x), `kcal-kolumn ${g.slot}`).toBeLessThan(0.5);
      expect(
        Math.abs(g.kcal.x + g.kcal.width - (first.kcal.x + first.kcal.width)),
        `kcal högerkant ${g.slot}`,
      ).toBeLessThan(0.5);
      expect(Math.abs(g.add.x - first.add.x), `+ ${g.slot}`).toBeLessThan(0.5);
    }
    for (const g of geometry) {
      // Pilen till vänster om namnet, kcal till höger om namnet och före ⋯ och +.
      expect(g.chevron.x + g.chevron.width).toBeLessThan(g.name.x);
      expect(g.name.x + g.name.width).toBeLessThanOrEqual(g.value.x + 0.5);
      expect(g.value.x + g.value.width).toBeLessThanOrEqual(g.more.x + 0.5);
      expect(g.more.x + g.more.width).toBeLessThanOrEqual(g.add.x + 0.5);
      // En rad: namnet och kcal är lika höga som en textrad och står på samma höjd som ⋯ och +.
      expect(g.name.height, `namn ${g.slot}`).toBeLessThan(30);
      expect(g.kcal.height, `kcal ${g.slot}`).toBeLessThan(30);
      const mid = (b: Box) => b.y + b.height / 2;
      expect(Math.abs(mid(g.name) - mid(g.kcal))).toBeLessThan(2);
      expect(Math.abs(mid(g.name) - mid(g.add))).toBeLessThan(3);
      expect(Math.abs(mid(g.name) - mid(g.chevron))).toBeLessThan(3);
      // Makroraden under, indragen i linje med namnet.
      expect(Math.abs(g.detail.x - g.name.x), `makrorad ${g.slot}`).toBeLessThan(0.5);
      expect(g.detail.y).toBeGreaterThanOrEqual(g.name.y + g.name.height - 0.5);
      // ⋯ och + har minst 44 px tryckyta.
      expect(g.more.width).toBeGreaterThanOrEqual(44);
      expect(g.add.height).toBeGreaterThanOrEqual(44);
    }

    // En tom måltid (middag): namnet i samma kolumn, + i samma kolumn.
    const empty = {
      name: await box(page, '[data-testid="meal-middag"] .accordion-name'),
      add: await box(page, '[data-testid="meal-middag"] .accordion-add'),
    };
    expect(Math.abs(empty.name.x - first.name.x)).toBeLessThan(0.5);
    expect(Math.abs(empty.add.x - first.add.x)).toBeLessThan(0.5);

    // Långt namn + antal kortas med … i stället för att brytas.
    const truncated = await page
      .locator('[data-testid="meal-mellanmal"] .accordion-name')
      .evaluate((el) => ({
        overflow: getComputedStyle(el).textOverflow,
        wrap: getComputedStyle(el).whiteSpace,
      }));
    expect(truncated).toEqual({ overflow: 'ellipsis', wrap: 'nowrap' });

    // Pilen roterar vid utfällning (lunch är pågående måltid kl. 12.30).
    const lunchToggle = lunch.getByRole('heading').getByRole('button');
    await expect(lunchToggle).toHaveAttribute('aria-expanded', 'true');
    const rotation = () =>
      page
        .locator('[data-testid="meal-lunch"] .accordion-chevron')
        .evaluate((el) => getComputedStyle(el).transform);
    const expandedTransform = await rotation();
    // Hela rubriken utom ⋯ och + fäller ihop – även ett tryck på kcal.
    await lunch.getByTestId('meal-kcal').tap();
    await expect(lunchToggle).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(rotation).not.toBe(expandedTransform);
    // ⋯ öppnar menyn utan att fälla ut.
    await page.getByRole('button', { name: 'Fler val för lunch' }).tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(lunchToggle).toHaveAttribute('aria-expanded', 'false');

    expect(errors).toEqual([]);
  });
}

test('veckoraden i Mat → Dag är samma korta rad som på Översikt, fibernotisen bakom en info-ikon', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await open(page);
  const row = page.getByTestId('week-row-text');
  await expect(row).toHaveText(/^Vecka: [\d\s]+ kcal (kvar|över)( · ≈ [\d\s]+\/dag)?$/);
  await expect(page.getByTestId('week-balance')).toHaveCount(0);
  const rowBox = await page.getByTestId('week-row').boundingBox();
  expect(rowBox?.height).toBeLessThan(50);

  // Poster utan fiberdata: asterisk vid fibervärdet, förklaringen först efter tryck på ikonen.
  const macros = page.getByTestId('macros');
  await expect(macros.getByTestId('fiber-partial')).toBeVisible();
  await expect(page.getByTestId('fiber-incomplete')).toHaveCount(0);
  await macros.getByRole('button', { name: 'Om fibervärdet' }).tap();
  await expect(page.getByTestId('fiber-incomplete')).toContainText(
    'Dagens fiber kan vara i underkant – 1 post saknar fiberdata.',
  );
  expect(errors).toEqual([]);
});
