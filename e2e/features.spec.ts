import { expect, test, type Page } from '@playwright/test';
import { collectErrors, dump, isoDaysFromToday, seed } from './helpers.ts';

/** Lite av allt, idag, så att varje vy har något att visa. */
const DATA = {
  profile: {
    startDate: isoDaysFromToday(-30),
    startWeightKg: 90,
    heightCm: 180,
    goalWeightKg: 80,
    sex: 'kvinna',
    birthYear: 1985,
    activityLevel: 'latt',
    ratePerWeekKg: 0.5,
  },
  weights: [{ id: 'w1', date: isoDaysFromToday(0), weightKg: 88, createdAt: Date.now() }],
  waist: [{ date: isoDaysFromToday(0), waistCm: 95, createdAt: Date.now() }],
  steps: [{ date: isoDaysFromToday(0), steps: 8000, createdAt: Date.now() }],
  foodLog: [
    {
      id: 'f1',
      date: isoDaysFromToday(0),
      meal: 'frukost',
      foodId: 'egen:gröt',
      name: 'Gröt',
      grams: 200,
      per100: { kcal: 100, proteinG: 3, carbsG: 15, fatG: 2 },
      createdAt: Date.now(),
    },
  ],
  photos: [
    {
      id: 'p1',
      date: isoDaysFromToday(0),
      createdAt: Date.now(),
      width: 1,
      height: 1,
      bytes: [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4],
    },
  ],
};

function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Huvudmeny' });
}

async function setFeature(page: Page, name: RegExp, on: boolean) {
  await page.goto('./#/installningar');
  const toggle = page.getByRole('switch', { name });
  await toggle.setChecked(on);
  await expect(toggle).toBeChecked({ checked: on });
}

/** Vad som syns i varje vy som berörs av brytarna. */
async function observe(page: Page) {
  await page.goto('./');
  const today = page.getByTestId('today-card');
  await expect(today).toBeVisible();
  const navLabels = await nav(page).getByRole('link').allTextContents();
  const todayLabels = await today.locator('dt').allTextContents();
  const calorieCard = await page.getByRole('heading', { name: 'Kalorimål' }).count();

  await page.goto('./#/logga');
  await expect(page.getByTestId('log-tile-vikt')).toBeVisible();
  const tiles = await page.locator('.log-tile-label').allTextContents();

  await page.goto('./#/framsteg');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Framsteg');
  await expect(page.getByRole('img', { name: /Viktgraf/ })).toBeVisible();
  const tabs = await page
    .getByRole('group', { name: 'Visa' })
    .getByRole('button')
    .allTextContents();
  const sections = await page.getByRole('heading', { level: 2 }).allTextContents();

  await page.goto('./#/kalender');
  await expect(page.getByTestId('calendar-value-vikt')).toBeVisible();
  const legend = await page
    .getByRole('list', { name: 'Förklaring' })
    .locator('li')
    .allTextContents();
  const day = await page.getByTestId('calendar-day').locator('dt').allTextContents();

  return { navLabels, todayLabels, calorieCard, tiles, tabs, sections, legend, day };
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await seed(page, DATA);
});

test('allt på som standard', async ({ page }) => {
  const errors = collectErrors(page);
  const v = await observe(page);
  expect(v.navLabels).toEqual(['Översikt', 'Logga', 'Mat', 'Kalender', 'Framsteg']);
  expect(v.todayLabels).toEqual(['Vatten', 'Steg', 'Mat', 'Träning']);
  expect(v.calorieCard).toBe(1);
  expect(v.tiles).toEqual(['Vikt', 'Midja', 'Steg', 'Vatten', 'Träning']);
  expect(v.tabs).toEqual(['Historik', 'Bilder']);
  expect(v.sections).toEqual(expect.arrayContaining(['Steg', 'Midjemått']));
  expect(v.legend).toEqual(['Vikt', 'Midja', 'Steg', 'Mat', 'Vatten', 'Träning', 'Bilder']);
  await expect(page.getByTestId('calendar-value-bilder')).toHaveText(/1 bild/);
  expect(errors).toEqual([]);
});

test('steg av döljer steg i Logga, Översikt, Kalender och grafer', async ({ page }) => {
  await setFeature(page, /^Steg/, false);
  const v = await observe(page);
  expect(v.tiles).toEqual(['Vikt', 'Midja', 'Vatten', 'Träning']);
  expect(v.todayLabels).not.toContain('Steg');
  expect(v.sections).not.toContain('Steg');
  await page.goto('./#/framsteg');
  await expect(page.getByRole('img', { name: 'Stapelgraf med steg per dag' })).toHaveCount(0);
  expect(v.legend).not.toContain('Steg');
  expect(v.day).not.toContain('Steg');
  // Övrigt opåverkat.
  expect(v.navLabels).toHaveLength(5);
  expect(v.sections).toContain('Midjemått');
});

test('midjemått av döljer midja i Logga, Översikt, Kalender och historik', async ({ page }) => {
  await setFeature(page, /^Midjemått/, false);
  const v = await observe(page);
  expect(v.tiles).toEqual(['Vikt', 'Steg', 'Vatten', 'Träning']);
  expect(v.todayLabels).not.toContain('Midja');
  expect(v.sections).not.toContain('Midjemått');
  expect(v.legend).not.toContain('Midja');
  expect(v.day).not.toContain('Midja');
  expect(v.sections).toContain('Steg');
});

test('mat av döljer Mat i navigeringen, kalorimålet och kalendern', async ({ page }) => {
  await setFeature(page, /^Mat/, false);
  const v = await observe(page);
  expect(v.navLabels).toEqual(['Översikt', 'Logga', 'Kalender', 'Framsteg']);
  expect(v.calorieCard).toBe(0);
  expect(v.todayLabels).not.toContain('Mat');
  expect(v.legend).not.toContain('Mat');
  expect(v.day).not.toContain('Mat');
  // Ett gammalt bokmärke till Mat visar Översikt.
  await page.goto('./#/mat');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Översikt');
  // Navigeringen har fortfarande stora tryckytor med fyra flikar.
  for (const link of await nav(page).getByRole('link').all()) {
    expect((await link.boundingBox())?.width).toBeGreaterThanOrEqual(48);
  }
});

test('bilder av döljer fliken i Framsteg och i kalendern', async ({ page }) => {
  await setFeature(page, /^Bilder/, false);
  const v = await observe(page);
  expect(v.tabs).toEqual([]);
  expect(v.todayLabels).not.toContain('Bilder');
  expect(v.legend).not.toContain('Bilder');
  expect(v.day).not.toContain('Bilder');
  await page.goto('./#/framsteg/bilder');
  await expect(page.getByRole('heading', { name: 'Ny bild' })).toHaveCount(0);
  await expect(page.getByTestId('history-table')).toBeVisible();
});

test('avstängda funktioner: datan ligger kvar, exporteras och syns igen', async ({ page }) => {
  for (const name of [/^Steg/, /^Midjemått/, /^Mat/, /^Bilder/]) {
    await setFeature(page, name, false);
  }
  // Inställningen överlever omladdning.
  await page.reload();
  await expect(page.getByRole('switch', { name: /^Mat/ })).not.toBeChecked();
  const stored = await dump(page);
  expect(stored.settings.features).toMatchObject({
    steg: false,
    midja: false,
    mat: false,
    bilder: false,
  });
  expect(stored.steps).toHaveLength(1);
  expect(stored.waist).toHaveLength(1);
  expect(stored.foodLog).toHaveLength(1);
  expect(stored.photos).toHaveLength(1);

  // Säkerhetskopian innehåller allt.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportera säkerhetskopia' }).tap();
  await page.getByLabel('Välj säkerhetskopia').setInputFiles(await (await download).path());
  const preview = page.getByTestId('import-preview');
  await expect(preview.getByTestId('preview-steps')).toHaveText('1');
  await expect(preview.getByTestId('preview-waist')).toHaveText('1');
  await expect(preview.getByTestId('preview-food-log')).toHaveText('1');
  await expect(preview.getByTestId('preview-photos')).toHaveText(/^1 /);

  // Slås de på igen syns datan.
  for (const name of [/^Steg/, /^Midjemått/, /^Mat/, /^Bilder/]) {
    await setFeature(page, name, true);
  }
  await page.goto('./#/kalender');
  await expect(page.getByTestId('calendar-value-steg')).toHaveText(/8 000 steg/);
  await expect(page.getByTestId('calendar-value-midja')).toHaveText(/95 cm/);
  await expect(page.getByTestId('calendar-value-mat')).toHaveText(/200 kcal/);
  await expect(page.getByTestId('calendar-value-bilder')).toHaveText(/1 bild/);
});

test('kommande funktioner kan inte slås på', async ({ page }) => {
  await page.goto('./#/installningar');
  for (const name of [/^GLP-1/]) {
    const toggle = page.getByRole('switch', { name });
    await expect(toggle).toBeDisabled();
    await expect(toggle).not.toBeChecked();
  }
});
