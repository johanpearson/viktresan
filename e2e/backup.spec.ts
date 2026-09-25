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
  },
  measurements: [
    { id: 'a', date: isoDaysFromToday(-30), weightKg: 90, createdAt: 1_700_000_000_000 },
    {
      id: 'b',
      date: isoDaysFromToday(-1),
      weightKg: 87.4,
      waistCm: 95,
      steps: 11234,
      note: 'Promenad – "å ä ö"',
      createdAt: 1_700_000_100_000,
      updatedAt: 1_700_000_200_000,
    },
  ],
  photos: [
    {
      id: 'p1',
      date: isoDaysFromToday(-30),
      createdAt: 1_700_000_050_000,
      weightKg: 90,
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

async function chooseBackup(page: Page, buffer: Buffer) {
  await page
    .getByLabel('Välj säkerhetskopia')
    .setInputFiles({ name: 'backup.zip', mimeType: 'application/zip', buffer });
}

test('export → import ger identisk data', async ({ page }) => {
  const errors = collectErrors(page);
  await openSettings(page);
  await seed(page, DATA);
  const before = await dump(page);
  expect(before.measurements).toHaveLength(2);

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
  await expect(preview.getByTestId('preview-measurements')).toHaveText('2');
  await expect(preview.getByTestId('preview-photos')).toHaveText('1 (12 B)');
  await expect(preview).toContainText('Krypterad');

  await preview.getByLabel(/Ersätt all befintlig data/).check();
  await preview.getByRole('button', { name: 'Ersätt och importera' }).tap();
  await expect(page.getByRole('status').filter({ hasText: 'Importen är klar' })).toContainText(
    '2 mätningar och 1 bilder ersatte',
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
  await seed(page, DATA);
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
  await expect(preview.getByTestId('preview-measurements')).toHaveText('2');
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
    measurements: [{ id: 'lokal', date: isoDaysFromToday(0), weightKg: 87, createdAt: Date.now() }],
  });
  await openSettings(page);
  await chooseBackup(page, zip);
  await page.getByTestId('import-preview').getByRole('button', { name: 'Importera' }).tap();
  await expect(page.getByRole('status').filter({ hasText: 'slogs ihop' })).toBeVisible();
  const after = await dump(page);
  expect(after.measurements.map((m) => (m as { id: string }).id)).toEqual(['a', 'b', 'lokal']);
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
    measurements: [
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
    measurements: [{ id: 'x', date: isoDaysFromToday(0), weightKg: 88, createdAt: Date.now() }],
  });
  await page.reload();
  await expect(page.getByTestId('current-weight')).toBeVisible();
  await expect(page.getByTestId('backup-reminder')).toBeHidden();
});
