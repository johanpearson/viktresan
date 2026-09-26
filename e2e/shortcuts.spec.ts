import { expect, test, type Page } from '@playwright/test';
import { collectErrors, dump, isoDaysFromToday, seed } from './helpers.ts';

// Service workern skulle annars svara på livsmedel.json från sin cache, förbi page.route.
test.use({ serviceWorkers: 'block' });

/** Påhittade testvärden i Livsmedelsverket-formatet – inte riktiga data. */
const LIVSMEDEL = {
  format: 'viktresan-livsmedel',
  source: 'Testdatabas',
  license: 'CC BY 4.0',
  retrieved: '2026-09-01',
  foods: [
    [1, 'Kvarg naturell', 65, 11, 4, 0.2],
    [2, 'Ost hårdost', 350, 27, 0, 27],
  ],
};

const PROFILE = {
  startDate: isoDaysFromToday(-10),
  startWeightKg: 90,
  heightCm: 180,
  goalWeightKg: 80,
};

/** Öppnar appen som från en genväg på appikonen. */
async function launch(page: Page, action: string, data: Parameters<typeof seed>[1] = {}) {
  await page.route('**/livsmedel.json', (route) => route.fulfill({ json: LIVSMEDEL }));
  await page.goto('./');
  await seed(page, { profile: PROFILE, ...data });
  await page.goto(`./?action=${action}`);
}

function toast(page: Page) {
  return page.getByTestId('shortcut-toast');
}

test('manifestet har tre genvägar med egna ikoner', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = (await (await request.get(new URL(href ?? '', page.url()).href)).json()) as {
    shortcuts: { name: string; url: string; icons: { src: string; sizes: string }[] }[];
  };
  expect(manifest.shortcuts.map((s) => [s.name, s.url])).toEqual([
    ['Logga vikt', '/viktresan/?action=log-weight'],
    ['+250 ml (glas)', '/viktresan/?action=add-water'],
    ['Logga mat', '/viktresan/?action=log-food'],
  ]);
  for (const s of manifest.shortcuts) {
    const [icon] = s.icons;
    expect(icon?.sizes).toBe('96x96');
    const res = await request.get(new URL(icon?.src ?? '', page.url()).href);
    expect(res.status(), icon?.src).toBe(200);
    expect(res.headers()['content-type']).toBe('image/png');
  }
});

test('genvägen Logga vikt öppnar viktpanelen', async ({ page }) => {
  const errors = collectErrors(page);
  await launch(page, 'log-weight');
  const sheet = page.getByRole('dialog', { name: 'Logga vikt' });
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/\/viktresan\/#\/logga\/vikt$/);
  await sheet.getByLabel('Vikt (kg)').fill('88,4');
  await sheet.getByRole('button', { name: 'Spara', exact: true }).tap();
  await expect.poll(async () => (await dump(page)).weights.length).toBe(1);
  expect(errors).toEqual([]);
});

test('genvägen +250 ml (glas) loggar direkt och kan ångras', async ({ page }) => {
  const errors = collectErrors(page);
  await launch(page, 'add-water');
  await expect(toast(page)).toContainText('La till 250 ml dryck.');
  const ring = page.getByRole('progressbar', { name: 'Dryck idag' });
  await expect(ring).toHaveAttribute('aria-valuetext', /^250 ml av /);
  // Adressen är städad: en omladdning loggar inte en gång till.
  await expect(page).toHaveURL(/\/viktresan\/#\/$/);
  await page.reload();
  await expect(ring).toHaveAttribute('aria-valuetext', /^250 ml av /);
  expect((await dump(page)).water).toHaveLength(1);

  await page.goto('./?action=add-water');
  await expect(ring).toHaveAttribute('aria-valuetext', /^500 ml av /);
  await toast(page).getByRole('button', { name: 'Ångra' }).tap();
  await expect(toast(page)).toContainText('Ångrade 250 ml.');
  await expect(ring).toHaveAttribute('aria-valuetext', /^250 ml av /);
  await toast(page).getByRole('button', { name: 'Stäng' }).tap();
  await expect(toast(page)).toHaveCount(0);
  expect((await dump(page)).water).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('genvägen Logga mat öppnar sök, med proteinrik-etikett', async ({ page }) => {
  const errors = collectErrors(page);
  await launch(page, 'log-food');
  const sheet = page.getByRole('dialog', { name: 'Logga mat' });
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/#\/mat\/logga$/);

  await sheet.getByLabel('Sök livsmedel').fill('kvarg');
  const kvarg = sheet.getByTestId('search-result').filter({ hasText: 'Kvarg naturell' });
  await expect(kvarg.getByTestId('protein-rich')).toHaveText('Proteinrik');
  await sheet.getByLabel('Sök livsmedel').fill('ost');
  const ost = sheet.getByTestId('search-result').filter({ hasText: 'Ost hårdost' });
  await expect(ost).toBeVisible();
  await expect(ost.getByTestId('protein-rich')).toHaveCount(0);

  await sheet.getByLabel('Sök livsmedel').fill('kvarg');
  await kvarg.tap();
  const form = sheet.getByTestId('food-log-form');
  await form
    .getByRole('group', { name: 'Enhet' })
    .getByRole('button', { name: 'g', exact: true })
    .tap();
  await form.getByLabel(/^Mängd/).fill('200');
  await form.getByRole('button', { name: 'Logga', exact: true }).tap();
  await expect(sheet.getByRole('status').filter({ hasText: 'Loggade' })).toContainText(
    'Kvarg naturell (200 g)',
  );
  await sheet.getByRole('button', { name: 'Stäng' }).tap();

  // Mat → Dag: protein bredvid kalorier. Mål 1,6 × 80 kg = 128 g.
  await expect(page.getByRole('progressbar', { name: 'Protein idag' })).toHaveAttribute(
    'aria-valuetext',
    '22 g av 128 g',
  );
  await expect(page.getByRole('progressbar', { name: 'Kalorier idag' })).toHaveAttribute(
    'aria-valuetext',
    /^130 /,
  );
  expect(errors).toEqual([]);
});

test('avstängd funktion: genvägen erbjuder att slå på den', async ({ page }) => {
  const errors = collectErrors(page);
  await launch(page, 'add-water', {
    settings: { features: { vatten: false, version: 3 } },
  });
  await expect(toast(page)).toContainText('Dryck är avstängt');
  expect((await dump(page)).water).toHaveLength(0);
  await toast(page).getByRole('button', { name: 'Slå på Dryck' }).tap();
  await expect(toast(page)).toContainText('La till 250 ml dryck.');
  await expect(page.getByRole('progressbar', { name: 'Dryck idag' })).toBeVisible();
  expect((await dump(page)).water).toHaveLength(1);

  // Mat avstängd: "Inte nu" lämnar den avstängd.
  await seed(page, { settings: { features: { mat: false, version: 3 } } });
  await page.goto('./?action=log-food');
  await expect(toast(page)).toContainText('Mat är avstängt');
  await toast(page).getByRole('button', { name: 'Inte nu' }).tap();
  await expect(toast(page)).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('navigation', { name: 'Huvudmeny' }).getByRole('link', { name: 'Mat' }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
