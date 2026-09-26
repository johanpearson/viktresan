import { expect, test, type Page } from '@playwright/test';
import { collectErrors, dump, openLog, seed } from './helpers.ts';

/**
 * Tiden styrs med page.clock så att "idag" och klockslaget är kända: onsdag
 * 2026-09-16 (lokal tid). Veckan börjar måndag 14 september.
 */
const WEDNESDAY = '2026-09-16';

const PROFILE = {
  startDate: '2026-09-01',
  startWeightKg: 82,
  heightCm: 180,
  goalWeightKg: 75,
};

function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Huvudmeny' });
}

async function start(page: Page, time: string, data: Parameters<typeof seed>[1] = {}) {
  await page.clock.setFixedTime(new Date(`${WEDNESDAY}T${time}:00`));
  await page.goto('./');
  await seed(page, { profile: PROFILE, ...data });
  await page.reload();
  await expect(page.getByTestId('today-card')).toBeVisible();
}

/** Dagen i kalenderns månads- eller veckovy. */
function day(page: Page, date: string) {
  return page.locator(`button[data-date="${date}"]`);
}

test('planera ett pass, bocka av det från Översikt och se status i kalendern', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, '06:00');

  // Logga → Träning → Återkommande: mån/ons/fre 07:00.
  await nav(page).getByRole('link', { name: 'Logga' }).tap();
  await openLog(page, 'traning');
  const sheet = page.getByRole('dialog', { name: 'Träning' });
  await sheet.getByRole('button', { name: 'Återkommande' }).tap();
  await sheet.getByRole('combobox', { name: 'Typ', exact: true }).selectOption('Löpning');
  for (const d of ['måndag', 'onsdag', 'fredag']) {
    await sheet.getByRole('button', { name: d, exact: true }).tap();
  }
  await sheet.getByLabel('Tid').fill('07:00');
  await sheet.getByLabel('Längd (min)').fill('30');
  await sheet.getByRole('combobox', { name: 'Intensitet (valfri)' }).selectOption('medel');
  await sheet.getByRole('button', { name: 'Spara schema' }).tap();
  await expect(sheet.getByRole('status')).toHaveText(
    'Schemat är sparat: Löpning mån, ons, fre 07:00.',
  );
  await expect(sheet.getByTestId('workout-plan')).toHaveCount(1);
  await sheet.getByRole('button', { name: 'Stäng' }).tap();
  await expect(page.getByTestId('log-tile-traning')).toContainText('Idag 0 av 1 klara');

  // Översikt: dagens pass under Idag, de tre nästa under Kommande.
  await nav(page).getByRole('link', { name: 'Översikt' }).tap();
  const today = page.getByTestId('today-card');
  const workout = today.getByTestId('workout');
  await expect(workout).toHaveCount(1);
  await expect(workout).toContainText('07:00');
  await expect(workout).toContainText('Löpning · 30 min · Medel');
  await expect(workout).toHaveAttribute('data-status', 'planerad');
  await expect(page.getByTestId('upcoming-card').getByTestId('workout')).toHaveCount(3);
  await expect(
    page
      .getByTestId('upcoming-card')
      .getByTestId('workout')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-date'))),
  ).resolves.toEqual(['2026-09-18', '2026-09-21', '2026-09-23']);
  await expect(page.getByTestId('missed-workouts')).toHaveCount(0);

  // Klar → panel med planens längd och intensitet förifyllda; justera och spara.
  await workout.getByRole('button', { name: /^Klar/ }).tap();
  const complete = page.getByRole('dialog', { name: 'Markera som klar' });
  await expect(complete.getByLabel('Faktisk längd (min)')).toHaveValue('30');
  await expect(complete.getByRole('button', { name: 'Medel' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await complete.getByLabel('Faktisk längd (min)').fill('45');
  await complete.getByRole('button', { name: 'Hög' }).tap();
  await complete.getByRole('button', { name: 'Spara som genomfört' }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(workout).toHaveAttribute('data-status', 'genomford');
  await expect(workout).toContainText('Löpning · 45 min · Hög');
  await expect(workout.getByRole('button', { name: /^Klar/ })).toHaveCount(0);
  await expect(page.getByTestId('today-traning')).toHaveText(/1 genomfört/);

  // Kalendern: genomfört idag, planerat på fredag.
  await nav(page).getByRole('link', { name: 'Kalender' }).tap();
  await expect(day(page, WEDNESDAY).locator('.dot-traning')).toHaveClass(/status-genomford/);
  await expect(day(page, '2026-09-18').locator('.dot-traning')).toHaveClass(/status-planerad/);
  await expect(day(page, '2026-09-14').locator('.dot-traning')).toHaveCount(0);
  const dayView = page.getByTestId('calendar-day');
  await expect(dayView.getByTestId('workout')).toHaveAttribute('data-status', 'genomford');
  await expect(dayView.getByTestId('workout')).toContainText('Genomförd');

  // Status kan ändras i efterhand från dagsvyn.
  await dayView.getByRole('combobox', { name: /^Status: Löpning/ }).selectOption('hoppad');
  await expect(dayView.getByTestId('workout')).toHaveAttribute('data-status', 'hoppad');
  await expect(day(page, WEDNESDAY).locator('.dot-traning')).toHaveClass(/status-hoppad/);

  const stored = await dump(page);
  expect(stored.workoutPlans).toHaveLength(1);
  expect(stored.workouts).toEqual([
    expect.objectContaining({
      date: WEDNESDAY,
      time: '07:00',
      type: 'Löpning',
      durationMin: 45,
      intensity: 'hog',
      status: 'hoppad',
    }),
  ]);
  expect(errors).toEqual([]);
});

test('passerade pass frågas "Blev passet av?" tills de är besvarade', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, '12:00', {
    workoutPlans: [
      {
        id: 'plan1',
        type: 'Styrketräning',
        weekdays: [0, 2],
        time: '07:00',
        durationMin: 50,
        startDate: '2026-09-14',
        createdAt: 1,
      },
    ],
    workouts: [
      {
        id: 'w1',
        date: '2026-09-15',
        type: 'Simning',
        durationMin: 40,
        status: 'planerad',
        createdAt: 2,
      },
      {
        id: 'w2',
        date: WEDNESDAY,
        time: '18:00',
        type: 'Yoga',
        durationMin: 30,
        status: 'planerad',
        createdAt: 3,
      },
    ],
  });

  // Mån 07:00, tis (hela dagen) och ons 07:00 har passerat; ons 18:00 har inte det.
  const missed = page.getByTestId('missed-workouts');
  await expect(missed.getByRole('heading', { name: 'Blev passet av?' })).toBeVisible();
  // Kortet ligger överst, före Idag.
  const cards = await page
    .locator('.page > section, .page > .card')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
  expect(cards.indexOf('missed-workouts')).toBeLessThan(cards.indexOf('today-card'));
  await expect(missed.getByTestId('workout')).toHaveCount(3);
  await expect(missed.getByTestId('workout').first()).toHaveAttribute('data-status', 'obesvarad');
  const todays = page.getByTestId('today-card').getByTestId('workout');
  await expect(todays).toHaveCount(1);
  await expect(todays).toContainText('Yoga');

  await missed
    .getByTestId('workout')
    .first()
    .getByRole('button', { name: /^Hoppade över/ })
    .tap();
  await expect(missed.getByTestId('workout')).toHaveCount(2);
  await missed.getByRole('button', { name: /^Klar: Simning/ }).tap();
  const complete = page.getByRole('dialog', { name: 'Markera som klar' });
  await expect(complete.getByLabel('Faktisk längd (min)')).toHaveValue('40');
  await complete.getByRole('button', { name: 'Spara som genomfört' }).tap();
  await expect(missed.getByTestId('workout')).toHaveCount(1);

  // Överlever omladdning: bara det obesvarade passet är kvar.
  await page.reload();
  await expect(missed.getByTestId('workout')).toHaveCount(1);
  await expect(missed).toContainText('Styrketräning');
  await missed.getByRole('button', { name: /^Klar: Styrketräning/ }).tap();
  await page.getByRole('button', { name: 'Spara som genomfört' }).tap();
  await expect(missed).toHaveCount(0);

  // Kalendern visar de olika markeringarna.
  await nav(page).getByRole('link', { name: 'Kalender' }).tap();
  await expect(day(page, '2026-09-14').locator('.dot-traning')).toHaveClass(/status-hoppad/);
  await expect(day(page, '2026-09-15').locator('.dot-traning')).toHaveClass(/status-genomford/);
  const wednesday = day(page, WEDNESDAY).locator('.dot-traning');
  await expect(wednesday).toHaveCount(2);
  await expect(wednesday.nth(0)).toHaveClass(/status-genomford/);
  await expect(wednesday.nth(1)).toHaveClass(/status-planerad/);
  expect(errors).toEqual([]);
});

test('kalender: obesvarade pass markeras, dagsvyn bockar av och veckovyn fungerar', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await start(page, '09:00', {
    weights: [{ id: 'a', date: '2026-09-10', weightKg: 81.2, createdAt: 1 }],
    water: [
      { id: 'v1', date: '2026-09-10', ml: 500, createdAt: 1 },
      { id: 'v2', date: '2026-09-10', ml: 750, createdAt: 2 },
    ],
    workouts: [
      {
        id: 'w1',
        date: '2026-09-10',
        time: '17:00',
        type: 'Cykling',
        durationMin: 60,
        status: 'planerad',
        createdAt: 3,
      },
      {
        id: 'w2',
        date: '2026-10-02',
        time: '08:00',
        type: 'Promenad',
        durationMin: 45,
        status: 'planerad',
        createdAt: 4,
      },
    ],
  });

  await page.goto('./#/kalender');
  await expect(page.getByRole('heading', { name: 'september 2026' })).toBeVisible();
  const legend = page.getByRole('list', { name: 'Förklaring' });
  await expect(legend).toContainText('Vatten');
  await expect(legend).toContainText('Träning');
  await expect(page.getByRole('list', { name: 'Träningsstatus' }).locator('li')).toHaveText([
    'Genomförd',
    'Hoppade över',
    'Obesvarad',
    'Planerad',
  ]);

  // Den 10:e: vikt, vatten och ett obesvarat pass.
  const tenth = day(page, '2026-09-10');
  await expect(tenth.locator('[data-marker]')).toHaveCount(3);
  await expect(tenth.locator('.dot-traning')).toHaveClass(/status-obesvarad/);
  await expect(tenth).toHaveAttribute('aria-label', /Vikt, Vatten, Träning/);
  await tenth.tap();
  const dayView = page.getByTestId('calendar-day');
  await expect(dayView.getByTestId('calendar-value-vikt')).toContainText('81,2 kg');
  await expect(dayView.getByTestId('calendar-value-vatten')).toContainText('1 250 ml');
  await expect(dayView.getByTestId('workout')).toHaveAttribute('data-status', 'obesvarad');

  // Snabbknappen i dagsvyn bockar av.
  await dayView.getByRole('button', { name: /^Klar: Cykling/ }).tap();
  await page.getByRole('button', { name: 'Spara som genomfört' }).tap();
  await expect(dayView.getByTestId('workout')).toHaveAttribute('data-status', 'genomford');
  await expect(tenth.locator('.dot-traning')).toHaveClass(/status-genomford/);

  // Framtida månader går att bläddra till (för planering).
  await page.getByRole('button', { name: 'Nästa månad' }).tap();
  await expect(page.getByRole('heading', { name: 'oktober 2026' })).toBeVisible();
  await expect(day(page, '2026-10-02').locator('.dot-traning')).toHaveClass(/status-planerad/);
  await day(page, '2026-10-02').tap();
  await expect(dayView.getByRole('heading', { level: 2 })).toContainText('2 okt');
  await expect(dayView.getByTestId('workout')).toContainText('Promenad');

  // Veckovy: veckan med den valda dagen, måndag först.
  await page.getByRole('button', { name: 'Vecka', exact: true }).tap();
  const week = page.getByTestId('calendar-week');
  await expect(week.locator('[data-date]')).toHaveCount(7);
  await expect(week.locator('[data-date]').first()).toHaveAttribute('data-date', '2026-09-28');
  await expect(day(page, '2026-10-02')).toHaveAttribute('aria-pressed', 'true');
  await expect(day(page, '2026-10-02')).toContainText('Träning: 1 planerat');

  await page.getByRole('button', { name: 'Föregående vecka' }).tap();
  await page.getByRole('button', { name: 'Föregående vecka' }).tap();
  await page.getByRole('button', { name: 'Föregående vecka' }).tap();
  await expect(week.locator('[data-date]').first()).toHaveAttribute('data-date', '2026-09-07');
  await expect(day(page, '2026-09-10')).toContainText('Vatten: 1 250 ml');
  await expect(day(page, '2026-09-10')).toContainText('Träning: 1 genomfört');
  await day(page, '2026-09-10').tap();
  await expect(dayView.getByTestId('calendar-value-vikt')).toBeVisible();

  // Tillbaka till månadsvyn visar den valda dagens månad.
  await page.getByRole('button', { name: 'Månad', exact: true }).tap();
  await expect(page.getByRole('heading', { name: 'september 2026' })).toBeVisible();
  await expect(day(page, '2026-09-10')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('vatten: logga, ångra, ring på Översikt, historik och eget mål', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, '10:00', {
    weights: [{ id: 'a', date: WEDNESDAY, weightKg: 80, createdAt: 1 }],
  });

  // Mål: 33 ml × 80 kg = 2 640 → 2 600 ml.
  const ring = page.getByRole('progressbar', { name: 'Vatten idag' });
  await expect(ring).toHaveAttribute('aria-valuetext', '0 ml av 2 600 ml');
  await page.getByRole('button', { name: 'Lägg till 250 ml vatten' }).tap();
  await expect(ring).toHaveAttribute('aria-valuetext', '250 ml av 2 600 ml');
  await expect(page.getByTestId('today-vatten')).toHaveText(/250 ml/);

  // Logga → Vatten: snabbknappar, valfri mängd och ångra.
  await page.goto('./#/logga');
  await expect(page.getByTestId('log-tile-vatten')).toContainText('Idag 250 ml av 2 600 ml');
  await openLog(page, 'vatten');
  const sheet = page.getByRole('dialog', { name: 'Logga vatten' });
  await sheet.getByRole('button', { name: 'Lägg till 500 ml vatten' }).tap();
  await sheet.getByLabel('Valfri mängd (ml)').fill('330');
  await sheet.getByRole('button', { name: 'Lägg till', exact: true }).tap();
  await expect(sheet.getByTestId('water-entry')).toHaveCount(3);
  await expect(sheet.getByRole('progressbar')).toHaveAttribute(
    'aria-valuetext',
    '1 080 ml av 2 600 ml',
  );
  await sheet.getByRole('button', { name: 'Ångra senaste' }).tap();
  await expect(sheet.getByRole('status')).toHaveText('Ångrade 330 ml.');
  await expect(sheet.getByTestId('water-entry')).toHaveCount(2);
  await sheet.getByLabel('Valfri mängd (ml)').fill('abc');
  await sheet.getByRole('button', { name: 'Lägg till', exact: true }).tap();
  await expect(sheet.getByRole('alert')).toHaveText('Ange mängd i ml (1–3 000).');
  await sheet.getByRole('button', { name: 'Stäng' }).tap();

  // Framsteg → Historik.
  await page.goto('./#/framsteg');
  const history = page.getByTestId('water-history');
  await expect(history.getByTestId('water-day')).toHaveCount(1);
  await expect(history.getByTestId('water-day')).toContainText('750 ml');

  // Eget mål i Inställningar.
  await page.goto('./#/installningar');
  await expect(page.getByTestId('water-goal-standard')).toContainText('≈ 2 600 ml');
  await page.getByLabel('Eget mål (ml, valfritt)').fill('2000');
  await page.getByRole('button', { name: 'Spara vattenmål' }).tap();
  await expect(page.getByText('Vattenmålet är 2 000 ml per dag.')).toBeVisible();
  // Profilen kan sparas utan att målet försvinner.
  await page.getByRole('button', { name: 'Spara profil' }).tap();
  await expect(page.getByText('Profilen är sparad.')).toBeVisible();

  await page.goto('./');
  await expect(ring).toHaveAttribute('aria-valuetext', '750 ml av 2 000 ml');
  expect((await dump(page)).profile).toMatchObject({ waterGoalMl: 2000 });
  expect(errors).toEqual([]);
});

test('vatten och träning av: dolda överallt, datan ligger kvar', async ({ page }) => {
  await start(page, '10:00', {
    water: [{ id: 'v1', date: WEDNESDAY, ml: 500, createdAt: 1 }],
    workouts: [
      {
        id: 'w1',
        date: '2026-09-15',
        type: 'Simning',
        durationMin: 40,
        status: 'planerad',
        createdAt: 2,
      },
    ],
  });
  await expect(page.getByTestId('missed-workouts')).toBeVisible();
  await page.goto('./#/installningar');
  await page.getByRole('switch', { name: /^Vatten/ }).setChecked(false);
  await page.getByRole('switch', { name: /^Träning/ }).setChecked(false);
  await expect(page.getByRole('heading', { name: 'Vattenmål' })).toHaveCount(0);

  await page.goto('./');
  await expect(page.getByTestId('today-card')).toBeVisible();
  await expect(page.getByTestId('missed-workouts')).toHaveCount(0);
  await expect(page.getByTestId('upcoming-card')).toHaveCount(0);
  await expect(page.getByTestId('water-ring')).toHaveCount(0);
  await page.goto('./#/logga');
  await expect(page.getByTestId('log-tile-vikt')).toBeVisible();
  await expect(page.getByTestId('log-tile-vatten')).toHaveCount(0);
  await expect(page.getByTestId('log-tile-traning')).toHaveCount(0);
  await page.goto('./#/kalender');
  await expect(page.getByRole('list', { name: 'Förklaring' })).not.toContainText('Vatten');
  await expect(page.getByRole('list', { name: 'Träningsstatus' })).toHaveCount(0);
  await expect(day(page, WEDNESDAY).locator('[data-marker]')).toHaveCount(0);

  const stored = await dump(page);
  expect(stored.water).toHaveLength(1);
  expect(stored.workouts).toHaveLength(1);
});
