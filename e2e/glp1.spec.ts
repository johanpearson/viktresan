import { expect, test, type Page } from '@playwright/test';
import { collectErrors, dump, openLog, seed } from './helpers.ts';

/**
 * Tiden styrs med page.clock: onsdag 2026-09-16 kl. 10:00 (lokal tid). Läkemedlet
 * tas på onsdagar 08:00, så idag är dosdag.
 */
const WEDNESDAY = '2026-09-16';

const PROFILE = {
  startDate: '2026-09-01',
  startWeightKg: 100,
  heightCm: 175,
  goalWeightKg: 85,
};

/** GLP-1 är av som standard. */
const GLP1_ON = { features: { glp1: true, version: 3 } };

function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Huvudmeny' });
}

function day(page: Page, date: string) {
  return page.locator(`button[data-date="${date}"]`);
}

async function start(page: Page, data: Parameters<typeof seed>[1] = {}) {
  await page.clock.setFixedTime(new Date(`${WEDNESDAY}T10:00:00`));
  await page.goto('./');
  await seed(page, { profile: PROFILE, settings: GLP1_ON, ...data });
  await page.reload();
  await expect(page.getByTestId('today-card')).toBeVisible();
}

test('lägga in läkemedel med dostrappa, logga dos och se den i kalendern', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await expect(page.getByTestId('next-dose')).toContainText('Lägg in ditt läkemedel');

  // Logga → GLP-1: utan läkemedel öppnas fliken Läkemedel.
  await nav(page).getByRole('link', { name: 'Logga' }).tap();
  await expect(page.getByTestId('log-tile-glp1')).toContainText('Lägg in läkemedel');
  await openLog(page, 'glp1');
  const sheet = page.getByRole('dialog', { name: 'GLP-1' });
  await expect(sheet.getByRole('button', { name: 'Läkemedel', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(sheet.getByTestId('prescriber-note')).toContainText(
    'Doser och dostrappa bestäms av den som förskrivit läkemedlet',
  );
  // Dosfälten är tomma – appen föreslår aldrig någon dos.
  await expect(sheet.getByLabel('Dos (mg), steg 1')).toHaveValue('');

  await sheet.getByRole('combobox', { name: 'Läkemedel' }).selectOption('Wegovy');
  await expect(sheet.getByRole('button', { name: 'Veckovis' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await sheet.getByRole('combobox', { name: 'Veckodag' }).selectOption({ label: 'onsdag' });
  await sheet.getByLabel('Tid').fill('08:00');
  await sheet.getByLabel('Från, steg 1').fill('2026-09-02');
  await sheet.getByLabel('Dos (mg), steg 1').fill('0,25');
  await sheet.getByRole('button', { name: 'Lägg till steg' }).tap();
  await sheet.getByLabel('Från, steg 2').fill('2026-09-30');
  await sheet.getByLabel('Dos (mg), steg 2').fill('0,5');
  await sheet.getByRole('button', { name: 'Spara läkemedel' }).tap();
  await expect(sheet.getByRole('status').first()).toHaveText('Wegovy är sparat.');
  const med = sheet.getByTestId('medication');
  await expect(med).toHaveCount(1);
  await expect(med).toContainText('Varje onsdag 08:00');
  await expect(med).toContainText('Nu 0,25 mg');
  await sheet.getByRole('button', { name: 'Stäng' }).tap();
  await expect(page.getByTestId('log-tile-glp1')).toContainText('Idag 0,25 mg');

  // Översikt: dosdag och ingen loggad dos → banner; Nästa dos är idag.
  await nav(page).getByRole('link', { name: 'Översikt' }).tap();
  const banner = page.getByTestId('dose-day-banner');
  await expect(banner).toContainText('Dosdag idag');
  await expect(banner).toContainText('Wegovy 0,25 mg kl. 08:00 är inte loggad än.');
  await expect(page.getByTestId('next-dose-value')).toHaveText('Idag 08:00 · Wegovy 0,25 mg');
  await expect(page.getByTestId('next-dose')).toContainText('Nästa steg i dostrappan: 0,5 mg');
  await expect(page.getByTestId('next-site')).toHaveText('Buk vänster');

  // "Logga dos" öppnar panelen direkt på Dos med dosen ur trappan och förslag på ställe.
  await banner.getByRole('link', { name: 'Logga dos' }).tap();
  const doseSheet = page.getByRole('dialog', { name: 'GLP-1' });
  await expect(doseSheet.getByRole('button', { name: 'Dos', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(doseSheet.getByLabel('Dos (mg)', { exact: true })).toHaveValue('0,25');
  await expect(doseSheet.getByRole('button', { name: /^Buk vänster/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(doseSheet.getByTestId('site-suggestion')).toHaveText(
    'Förslag för rotation: buk vänster.',
  );
  await doseSheet.getByLabel('Tid (valfri)').fill('08:05');
  await doseSheet.getByRole('button', { name: 'Spara dos' }).tap();
  await expect(doseSheet.getByRole('status')).toHaveText(
    'Dosen är loggad: Wegovy 0,25 mg, buk vänster.',
  );
  await expect(doseSheet.getByTestId('injection')).toHaveCount(1);
  // Nästa gång föreslås nästa ställe i rotationen.
  await expect(doseSheet.getByTestId('site-suggestion')).toHaveText(
    'Förslag för rotation: buk höger.',
  );

  // Mående: aptit och biverkningar.
  await doseSheet.getByRole('button', { name: 'Mående', exact: true }).tap();
  await doseSheet.getByRole('button', { name: 'Aptit 2' }).tap();
  await doseSheet.getByRole('button', { name: 'Illamående' }).tap();
  await doseSheet.getByRole('button', { name: 'Spara mående' }).tap();
  await expect(doseSheet.getByRole('status')).toHaveText(/Sparade måendet för 16 sep/);
  await doseSheet.getByRole('button', { name: 'Stäng' }).tap();
  await expect(page).toHaveURL(/#\/logga$/);

  // Översikt: bannern är borta och nästa dos är nästa onsdag.
  await nav(page).getByRole('link', { name: 'Översikt' }).tap();
  await expect(page.getByTestId('next-dose-value')).toHaveText(/23 sep.* 08:00 · Wegovy 0,25 mg/);
  await expect(page.getByTestId('dose-day-banner')).toHaveCount(0);
  await expect(page.getByTestId('last-dose')).toContainText('Wegovy 0,25 mg · Buk vänster');
  await expect(page.getByTestId('next-site')).toHaveText('Buk höger');

  // Kalendern: loggad dos idag, planerade doser framåt (med nästa steg i trappan).
  await nav(page).getByRole('link', { name: 'Kalender' }).tap();
  await expect(day(page, WEDNESDAY).locator('.dot-glp1')).toHaveClass(/dose-loggad/);
  await expect(day(page, '2026-09-23').locator('.dot-glp1')).toHaveClass(/dose-planerad/);
  await expect(day(page, '2026-09-30').locator('.dot-glp1')).toHaveClass(/dose-planerad/);
  // Missade dagar bakåt fyller inte kalendern.
  await expect(day(page, '2026-09-09').locator('.dot-glp1')).toHaveCount(0);
  await expect(day(page, WEDNESDAY)).toHaveAttribute('aria-label', /Dos/);
  await expect(page.getByTestId('calendar-value-glp1')).toHaveText(/Wegovy 0,25 mg$/);
  await expect(page.getByTestId('calendar-value-maende')).toContainText(
    'Aptit 2 av 5 · Illamående',
  );
  await day(page, '2026-09-30').tap();
  await expect(page.getByTestId('calendar-value-glp1')).toContainText('Wegovy 0,5 mg planerad');
  await page.getByRole('button', { name: 'Vecka', exact: true }).tap();
  await expect(page.getByTestId('calendar-week')).toContainText('Dos: Wegovy 0,5 mg planerad');

  const stored = await dump(page);
  expect(stored.medications).toEqual([
    expect.objectContaining({
      name: 'Wegovy',
      frequency: 'vecka',
      weekday: 2,
      time: '08:00',
      steps: [
        { date: '2026-09-02', doseMg: 0.25 },
        { date: '2026-09-30', doseMg: 0.5 },
      ],
    }),
  ]);
  expect(stored.injections).toEqual([
    expect.objectContaining({
      date: WEDNESDAY,
      time: '08:05',
      medicationName: 'Wegovy',
      doseMg: 0.25,
      site: 'buk-vanster',
    }),
  ]);
  expect(stored.symptoms).toEqual([
    expect.objectContaining({ date: WEDNESDAY, appetite: 2, sideEffects: ['Illamående'] }),
  ]);
  expect(errors).toEqual([]);
});

test('dosbyten syns som markeringar i viktgrafen', async ({ page }) => {
  const errors = collectErrors(page);
  const dose = (id: string, date: string, doseMg: number, createdAt: number) => ({
    id,
    date,
    medicationId: 'm',
    medicationName: 'Mounjaro',
    doseMg,
    createdAt,
  });
  await start(page, {
    medications: [
      {
        id: 'm',
        name: 'Mounjaro',
        frequency: 'vecka',
        weekday: 2,
        time: '08:00',
        steps: [
          { date: '2026-08-19', doseMg: 2.5 },
          { date: '2026-09-16', doseMg: 5 },
        ],
        createdAt: 1,
      },
    ],
    injections: [
      dose('a', '2026-08-19', 2.5, 2),
      dose('b', '2026-08-26', 2.5, 3),
      dose('c', '2026-09-02', 2.5, 4),
      dose('d', '2026-09-09', 2.5, 5),
      dose('e', '2026-09-16', 5, 6),
    ],
    weights: ['2026-08-18', '2026-08-25', '2026-09-01', '2026-09-08', '2026-09-15'].map(
      (date, i) => ({ id: `w${String(i)}`, date, weightKg: 100 - i, createdAt: i + 1 }),
    ),
  });

  await nav(page).getByRole('link', { name: 'Framsteg' }).tap();
  const chart = page.getByRole('img', { name: /Viktgraf.*dosbyten/ });
  await expect(chart).toHaveAttribute('data-markers', '2');
  const changes = page.getByTestId('dose-changes').getByRole('listitem');
  await expect(changes).toHaveCount(2);
  await expect(changes.nth(0)).toContainText('Mounjaro 5 mg');
  await expect(changes.nth(1)).toContainText('Start: Mounjaro 2,5 mg');

  // Med GLP-1 avstängd försvinner markeringarna – datan ligger kvar.
  await page.goto('./#/installningar');
  await page.getByRole('switch', { name: /^GLP-1/ }).setChecked(false);
  await page.goto('./#/framsteg');
  await expect(page.getByRole('img', { name: /^Viktgraf/ })).toHaveAttribute('data-markers', '0');
  await expect(page.getByTestId('dose-changes')).toHaveCount(0);
  expect((await dump(page)).injections).toHaveLength(5);
  expect(errors).toEqual([]);
});
