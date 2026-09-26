import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { DAY_MS, collectErrors, dump, isoDaysFromToday, seed, wipe } from './helpers.ts';

const DATA = {
  profile: {
    startDate: isoDaysFromToday(-30),
    startWeightKg: 90,
    heightCm: 180,
    goalWeightKg: 80,
    goalDate: isoDaysFromToday(120),
    sex: 'man',
    birthYear: 1980,
    activityLevel: 'mattlig',
    ratePerWeekKg: 0.75,
  },
  foods: [
    {
      id: 'egen:bulle',
      name: 'Kanelbulle',
      source: 'egen',
      per100: { kcal: 380, proteinG: 7, carbsG: 50, fatG: 16 },
      createdAt: 1_700_000_000_000,
    },
  ],
  foodUnits: [
    {
      foodId: 'egen:bulle',
      units: [{ name: 'bulle', grams: 60, source: 'egen' }],
      createdAt: 1_700_000_000_000,
    },
    {
      foodId: 'lv:1',
      units: [{ name: 'tallrik', grams: 250, source: 'egen' }],
      createdAt: 1_700_000_000_000,
    },
  ],
  meals: [
    {
      id: 'meal1',
      name: 'Fika',
      items: [
        {
          foodId: 'egen:bulle',
          name: 'Kanelbulle',
          amount: 1,
          unit: 'bulle',
          grams: 60,
          per100: { kcal: 380, proteinG: 7, carbsG: 50, fatG: 16 },
        },
      ],
      createdAt: 1_700_000_000_000,
    },
  ],
  foodLog: [
    {
      id: 'f1',
      date: isoDaysFromToday(-1),
      meal: 'mellanmal',
      foodId: 'maltid:meal1',
      name: 'Fika',
      amount: 1,
      unit: 'portion',
      grams: 60,
      per100: { kcal: 380, proteinG: 7, carbsG: 50, fatG: 16 },
      createdAt: 1_700_000_100_000,
    },
    {
      id: 'f2',
      date: isoDaysFromToday(-1),
      meal: 'lunch',
      foodId: 'lv:1',
      name: 'Pasta kokt',
      amount: 1,
      unit: 'tallrik',
      grams: 250,
      per100: { kcal: 150, proteinG: 5, carbsG: 30, fatG: 1 },
      createdAt: 1_700_000_100_000,
    },
  ],
  favorites: [{ foodId: 'egen:bulle', createdAt: 1_700_000_000_000 }],
  water: [
    { id: 'v1', date: isoDaysFromToday(-1), ml: 250, createdAt: 1_700_000_100_000 },
    { id: 'v2', date: isoDaysFromToday(-1), ml: 500, createdAt: 1_700_000_110_000 },
  ],
  workoutPlans: [
    {
      id: 'plan1',
      type: 'Löpning',
      weekdays: [0, 2, 4],
      time: '07:00',
      durationMin: 30,
      intensity: 'medel',
      startDate: isoDaysFromToday(-14),
      createdAt: 1_700_000_000_000,
    },
  ],
  workouts: [
    {
      id: 'w1',
      date: isoDaysFromToday(-2),
      time: '18:00',
      type: 'Klättring',
      durationMin: 90,
      note: 'Egen typ',
      status: 'genomford',
      createdAt: 1_700_000_090_000,
    },
  ],
  weights: [
    { id: 'a', date: isoDaysFromToday(-30), weightKg: 90, createdAt: 1_700_000_000_000 },
    {
      id: 'b',
      date: isoDaysFromToday(-1),
      weightKg: 87.4,
      note: 'Promenad – "å ä ö"',
      createdAt: 1_700_000_100_000,
      updatedAt: 1_700_000_200_000,
    },
  ],
  waist: [{ date: isoDaysFromToday(-1), waistCm: 95, createdAt: 1_700_000_100_000 }],
  steps: [
    { date: isoDaysFromToday(-2), steps: 9000, createdAt: 1_700_000_090_000 },
    {
      date: isoDaysFromToday(-1),
      steps: 11234,
      createdAt: 1_700_000_100_000,
      updatedAt: 1_700_000_200_000,
    },
  ],
  photoSessions: [
    {
      id: 's1',
      date: isoDaysFromToday(-30),
      weightKg: 90,
      note: 'Före',
      createdAt: 1_700_000_050_000,
    },
  ],
  photos: [
    {
      id: 'p1',
      sessionId: 's1',
      angle: 'profil',
      side: 'vanster',
      date: isoDaysFromToday(-30),
      createdAt: 1_700_000_050_000,
      width: 1080,
      height: 1440,
      bytes: [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 250, 251, 252, 253],
    },
  ],
};

async function openSettings(page: Page) {
  await page.goto('./#/installningar');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inställningar');
}

async function exportBackup(page: Page, password?: string): Promise<Buffer> {
  if (password) {
    await page.getByLabel('Kryptera med lösenord').check();
    await page.getByLabel('Lösenord', { exact: true }).fill(password);
    await page.getByLabel('Upprepa lösenordet').fill(password);
  }
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportera säkerhetskopia' }).tap();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^viktresan-backup-\d{4}-\d{2}-\d{2}\.zip$/);
  await expect(
    page.getByRole('status').filter({ hasText: 'Säkerhetskopian är nedladdad' }),
  ).toBeVisible();
  return readFile(await download.path());
}

/**
 * Seedar och laddar om: vid start markeras redan passerade milstolpar (utan firande),
 * så att "före" innehåller dem precis som efter en återställning.
 */
async function seedAndSettle(page: Page) {
  await seed(page, DATA);
  await page.reload();
  await expect
    .poll(async () => (await dump(page)).milestones.map((m) => (m as { id: string }).id))
    .toEqual(expect.arrayContaining(['bild-1', 'pass-1']));
}

async function chooseBackup(page: Page, buffer: Buffer) {
  await page
    .getByLabel('Välj säkerhetskopia')
    .setInputFiles({ name: 'backup.zip', mimeType: 'application/zip', buffer });
}

test('export → import ger identisk data', async ({ page }) => {
  const errors = collectErrors(page);
  await openSettings(page);
  await seedAndSettle(page);
  const before = await dump(page);
  expect(before.weights).toHaveLength(2);
  expect(before.waist).toHaveLength(1);
  expect(before.steps).toHaveLength(2);
  expect(before.foodLog).toHaveLength(2);
  expect(before.foods).toHaveLength(1);
  expect(before.meals).toHaveLength(1);
  expect(before.favorites).toHaveLength(1);
  expect(before.foodUnits).toHaveLength(2);
  expect(before.water).toHaveLength(2);
  expect(before.workouts).toHaveLength(1);
  expect(before.workoutPlans).toHaveLength(1);

  await openSettings(page);
  await expect(page.getByTestId('last-export')).toHaveText('Ingen export gjord ännu.');
  const zip = await exportBackup(page);
  expect(zip.subarray(0, 2).toString()).toBe('PK');
  await expect(page.getByTestId('last-export')).toContainText('(i dag)');

  // Ny "enhet": töm datan och återställ.
  await wipe(page);
  await openSettings(page);
  await chooseBackup(page, zip);
  const preview = page.getByTestId('import-preview');
  await expect(preview).toBeVisible();
  await expect(preview.getByTestId('preview-weights')).toHaveText('2');
  await expect(preview.getByTestId('preview-waist')).toHaveText('1');
  await expect(preview.getByTestId('preview-steps')).toHaveText('2');
  await expect(preview.getByTestId('preview-photos')).toHaveText('1 (12 B)');
  await expect(preview.getByTestId('preview-food-log')).toHaveText('2');
  await expect(preview.getByTestId('preview-foods')).toHaveText('1 + 1');
  await expect(preview.getByTestId('preview-water')).toHaveText('2');
  await expect(preview.getByTestId('preview-workouts')).toHaveText('1 + 1');
  await expect(preview).toContainText('Krypterad');

  await preview.getByLabel(/Ersätt all befintlig data/).check();
  await preview.getByRole('button', { name: 'Ersätt och importera' }).tap();
  await expect(page.getByRole('status').filter({ hasText: 'Importen är klar' })).toContainText(
    '5 mätningar, 2 matloggposter och 1 bilder ersatte',
  );

  const after = await dump(page);
  expect({ ...after, settings: {} }).toEqual({ ...before, settings: {} });
  // Profilformuläret visar den importerade profilen direkt.
  await expect(page.getByLabel('Startvikt (kg)')).toHaveValue('90');
  expect(errors).toEqual([]);
});

test('krypterad export: fel lösenord ger tydligt fel, rätt lösenord återställer', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openSettings(page);
  await seedAndSettle(page);
  const before = await dump(page);

  await openSettings(page);
  // För kort och olika lösenord stoppas innan något exporteras.
  await page.getByLabel('Kryptera med lösenord').check();
  await page.getByLabel('Lösenord', { exact: true }).fill('kort');
  await page.getByRole('button', { name: 'Exportera säkerhetskopia' }).tap();
  await expect(page.getByRole('alert')).toHaveText('Lösenordet måste ha minst 8 tecken.');
  await page.getByLabel('Lösenord', { exact: true }).fill('långt lösenord');
  await page.getByLabel('Upprepa lösenordet').fill('annat lösenord');
  await page.getByRole('button', { name: 'Exportera säkerhetskopia' }).tap();
  await expect(page.getByRole('alert')).toHaveText('Lösenorden matchar inte.');

  const zip = await exportBackup(page, 'korrekt häst batteri');
  expect(zip.toString('latin1')).not.toContain('Promenad');
  expect(zip.toString('latin1')).toContain('backup.enc');

  await wipe(page);
  await openSettings(page);
  await chooseBackup(page, zip);
  const password = page.getByLabel('Lösenord för säkerhetskopian');
  await password.fill('fel lösenord');
  await page.getByRole('button', { name: 'Öppna' }).tap();
  await expect(page.getByRole('alert')).toContainText('Fel lösenord');
  await expect(page.getByTestId('import-preview')).toBeHidden();

  await password.fill('korrekt häst batteri');
  await page.getByRole('button', { name: 'Öppna' }).tap();
  const preview = page.getByTestId('import-preview');
  await expect(preview.getByTestId('preview-weights')).toHaveText('2');
  await preview.getByRole('button', { name: 'Importera', exact: true }).tap();
  await expect(page.getByRole('status').filter({ hasText: 'Importen är klar' })).toBeVisible();

  const after = await dump(page);
  expect({ ...after, settings: {} }).toEqual({ ...before, settings: {} });
  expect(errors).toEqual([]);
});

test('import slår ihop med befintlig data', async ({ page }) => {
  await openSettings(page);
  await seed(page, DATA);
  await openSettings(page);
  const zip = await exportBackup(page);

  await wipe(page);
  await seed(page, {
    weights: [{ id: 'lokal', date: isoDaysFromToday(0), weightKg: 87, createdAt: Date.now() }],
    steps: [{ date: isoDaysFromToday(0), steps: 500, createdAt: Date.now() }],
  });
  await openSettings(page);
  await chooseBackup(page, zip);
  await page.getByTestId('import-preview').getByRole('button', { name: 'Importera' }).tap();
  await expect(page.getByRole('status').filter({ hasText: 'slogs ihop' })).toBeVisible();
  const after = await dump(page);
  expect(after.weights.map((m) => (m as { id: string }).id)).toEqual(['a', 'b', 'lokal']);
  expect(after.steps.map((s) => (s as { date: string }).date)).toEqual([
    isoDaysFromToday(-2),
    isoDaysFromToday(-1),
    isoDaysFromToday(0),
  ]);
});

test('ogiltig fil ger tydligt fel', async ({ page }) => {
  await openSettings(page);
  await chooseBackup(page, Buffer.from('det här är ingen zip'));
  await expect(page.getByRole('alert')).toHaveText('Filen är ingen giltig zip-fil.');
});

test('delar via Web Share API när det finns', async ({ page }) => {
  await page.addInitScript(() => {
    const shared: { name: string; size: number; type: string }[] = [];
    Object.assign(window, { __shared: shared });
    Object.defineProperty(navigator, 'canShare', {
      value: (data: ShareData) => Array.isArray(data.files) && data.files.length > 0,
    });
    Object.defineProperty(navigator, 'share', {
      value: (data: ShareData) => {
        for (const f of data.files ?? []) shared.push({ name: f.name, size: f.size, type: f.type });
        return Promise.resolve();
      },
    });
  });
  await openSettings(page);
  await page.getByRole('button', { name: 'Exportera säkerhetskopia' }).tap();
  await expect(
    page.getByRole('status').filter({ hasText: 'Säkerhetskopian är delad' }),
  ).toBeVisible();
  const shared = await page.evaluate(
    () => (window as unknown as { __shared: { name: string; type: string }[] }).__shared,
  );
  expect(shared).toEqual([
    expect.objectContaining({ name: expect.stringMatching(/\.zip$/), type: 'application/zip' }),
  ]);
});

test('påminner om säkerhetskopia efter 7 dagar utan export', async ({ page }) => {
  await page.goto('./');
  await seed(page, {
    profile: DATA.profile,
    weights: [
      { id: 'x', date: isoDaysFromToday(-8), weightKg: 88, createdAt: Date.now() - 8 * DAY_MS },
    ],
  });
  await page.reload();
  const reminder = page.getByTestId('backup-reminder');
  await expect(reminder).toContainText('Dags att säkerhetskopiera');
  await expect(reminder).toContainText('inte exporterat någon säkerhetskopia');

  // Gammal export → fortfarande påminnelse.
  await seed(page, { settings: { lastExportAt: Date.now() - 7 * DAY_MS - 1000 } });
  await page.reload();
  await expect(reminder).toContainText('mer än 7 dagar sedan');

  await reminder.getByRole('link', { name: 'Exportera nu' }).tap();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inställningar');
  await exportBackup(page);

  await page.goto('./');
  await expect(page.getByTestId('current-weight')).toBeVisible();
  await expect(reminder).toBeHidden();
});

test('ingen påminnelse för ny användare', async ({ page }) => {
  await page.goto('./');
  await seed(page, {
    profile: DATA.profile,
    weights: [{ id: 'x', date: isoDaysFromToday(0), weightKg: 88, createdAt: Date.now() }],
  });
  await page.reload();
  await expect(page.getByTestId('current-weight')).toBeVisible();
  await expect(page.getByTestId('backup-reminder')).toBeHidden();
});
