import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { isoDaysFromToday, openCalendarLegend, openLog, seed } from './helpers.ts';

const ROUTES = [
  ['Översikt', './'],
  ['Logga', './#/logga'],
  ['Mat', './#/mat'],
  ['Kalender', './#/kalender'],
  ['Framsteg', './#/framsteg'],
  ['Framsteg', './#/framsteg/veckor'],
  ['Framsteg', './#/framsteg/bilder'],
  ['Framsteg', './#/framsteg/milstolpar'],
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
      goalDate: isoDaysFromToday(20),
      sex: 'kvinna',
      birthYear: 1985,
      activityLevel: 'latt',
      ratePerWeekKg: 0.5,
    },
    foodLog: [
      {
        id: 'f1',
        date: isoDaysFromToday(0),
        meal: 'frukost',
        foodId: 'egen:gröt',
        name: 'Gröt',
        amount: 250,
        unit: 'g',
        grams: 250,
        per100: { kcal: 90, proteinG: 3, carbsG: 15, fatG: 2 },
        createdAt: Date.now(),
      },
    ],
    foods: [
      {
        id: 'egen:gröt',
        name: 'Gröt',
        source: 'egen',
        per100: { kcal: 90, proteinG: 3, carbsG: 15, fatG: 2 },
        createdAt: 1,
      },
    ],
    weights: [
      { id: 'a', date: isoDaysFromToday(-20), weightKg: 89, createdAt: Date.now() - 20 * 864e5 },
      { id: 'b', date: isoDaysFromToday(-10), weightKg: 88, createdAt: Date.now() - 10 * 864e5 },
      // Alltid i förra veckan, så att veckokortet visas på Översikt.
      { id: 'd', date: isoDaysFromToday(-7), weightKg: 87.6, createdAt: Date.now() - 7 * 864e5 },
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

    test('tillskott, AI-import, näring och UL-varning saknar tillgänglighetsfel', async ({
      page,
    }) => {
      await page.goto('./');
      const dose = [{ key: 'vitaminD', amount: 4000, unit: 'IE' }];
      await seed(page, {
        profile: {
          startDate: isoDaysFromToday(-30),
          startWeightKg: 90,
          heightCm: 180,
          goalWeightKg: 80,
        },
        settings: {
          features: {
            steg: true,
            midja: true,
            mat: true,
            vatten: true,
            traning: true,
            glp1: false,
            tillskott: true,
            bilder: true,
            version: 4,
          },
        },
        supplements: [
          {
            id: 's1',
            name: 'D-vitamin forte',
            form: 'tablett',
            amountPerDose: 1,
            nutrients: dose,
            schedule: 'dagligen',
            dosesPerDay: 2,
            createdAt: 1,
          },
          {
            id: 's2',
            name: 'Järn',
            form: 'tablett',
            amountPerDose: 1,
            nutrients: [{ key: 'iron', amount: 20, unit: 'mg' }],
            schedule: 'vid-behov',
            dosesPerDay: 1,
            createdAt: 1,
          },
        ],
        supplementLog: [
          {
            id: `s1:${isoDaysFromToday(0)}`,
            date: isoDaysFromToday(0),
            supplementId: 's1',
            name: 'D-vitamin forte',
            doses: 2,
            nutrients: dose,
            createdAt: 2,
          },
        ],
      });
      await page.goto('./');
      await page.reload();
      await expect(page.getByTestId('ul-warning')).toBeVisible();
      await expect(page.getByTestId('supplements-today')).toBeVisible();
      await expectNoViolations(page, 'Översikt med tillskott och varning');
      await page.goto('./#/logga/tillskott');
      const sheet = page.getByRole('dialog', { name: 'Tillskott' });
      await expect(sheet.getByTestId('supplement').first()).toBeVisible();
      await expectNoViolations(page, 'Logga tillskott');
      await sheet.getByTestId('supplement').first().tap();
      await expect(sheet.getByTestId('supplement-form')).toBeVisible();
      await expectNoViolations(page, 'Tillskott formulär');
      await sheet.getByRole('button', { name: 'Avbryt' }).tap();
      await sheet.getByRole('button', { name: /^Lägg in med AI från etikett/ }).tap();
      await sheet.getByLabel('AI-tjänstens svar (JSON)').fill('inte json');
      await sheet.getByRole('button', { name: 'Granska svaret' }).tap();
      await expect(sheet.getByTestId('ai-label-error')).toBeVisible();
      await expectNoViolations(page, 'Tillskott AI-import');
      await page.goto('./#/mat/naring');
      await expect(page.getByTestId('nutrition')).toBeVisible();
      await expectNoViolations(page, 'Mat näring med tillskott');
    });

    test('rapport: val och rapportvy saknar tillgänglighetsfel', async ({ page }) => {
      await seedData(page);
      await page.goto('./#/framsteg/rapport');
      await expect(page.getByTestId('report-settings')).toBeVisible();
      await expectNoViolations(page, 'Rapport val');
      await page.getByRole('link', { name: 'Visa rapport' }).tap();
      await expect(page.getByTestId('report')).toBeVisible();
      await expectNoViolations(page, 'Rapport');
    });

    test('sidor med data saknar tillgänglighetsfel', async ({ page }) => {
      await seedData(page);
      for (const [label, path] of ROUTES) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
        await page.waitForLoadState('networkidle');
        await expectNoViolations(page, label);
      }
      // Logga: panelerna för vikt (med anteckningsfältet), midja och steg.
      await page.goto('./#/logga');
      await openLog(page, 'vikt');
      await page.getByRole('button', { name: 'Lägg till anteckning' }).tap();
      await expectNoViolations(page, 'Logga vikt med anteckning');
      await openLog(page, 'midja');
      await expect(page.getByTestId('waist-entry')).toHaveCount(1);
      await expectNoViolations(page, 'Logga midja');
      await openLog(page, 'steg');
      await expectNoViolations(page, 'Logga steg');
      // Framsteg → Historik med steggraf och midjemått.
      await page.goto('./#/framsteg');
      await expect(page.getByRole('img', { name: 'Stapelgraf med steg per dag' })).toBeVisible();
      await expect(page.getByTestId('waist-history')).toBeVisible();
      await expectNoViolations(page, 'Framsteg historik');
      // Kalender: en dag med data vald.
      await page.goto('./#/kalender');
      await expect(page.getByTestId('calendar-value-vikt')).toBeVisible();
      await expectNoViolations(page, 'Kalender');
      // Mat: dagsvyn med måltider, sök-sheeten, loggformulär, redigering, egna och historik.
      await page.goto('./#/mat');
      const breakfast = page.getByTestId('meal-frukost').getByRole('heading').getByRole('button');
      if ((await breakfast.getAttribute('aria-expanded')) === 'false') await breakfast.tap();
      await expect(page.getByTestId('food-entry').first()).toBeVisible();
      await expectNoViolations(page, 'Mat dag');
      await page.getByRole('button', { name: 'Sök och logga mat' }).tap();
      const picker = page.getByRole('dialog', { name: 'Logga mat' });
      await expectNoViolations(page, 'Mat sök');
      await picker.getByTestId('quick-pick').first().tap();
      await expect(page.getByTestId('food-log-form')).toBeVisible();
      await expectNoViolations(page, 'Mat loggformulär');
      await page.getByRole('button', { name: 'Avbryt' }).tap();
      await picker.getByRole('button', { name: 'Skanna streckkod' }).tap();
      await expectNoViolations(page, 'Mat skanna');
      // Skannern är en egen modal ovanpå sök-sheeten: stäng den först.
      await page.getByTestId('scanner').getByRole('button', { name: 'Stäng' }).tap();
      await expect(page.getByTestId('scanner')).toHaveCount(0);
      await picker.getByRole('button', { name: 'Stäng', exact: true }).tap();
      await page.getByTestId('food-entry').first().getByRole('button').first().tap();
      await expect(page.getByRole('dialog', { name: 'Redigera post' })).toBeVisible();
      await expectNoViolations(page, 'Mat redigera post');
      await page.getByRole('button', { name: 'Avbryt' }).tap();
      await page.getByRole('button', { name: 'Egna', exact: true }).tap();
      await expectNoViolations(page, 'Mat egna');
      await page.getByRole('button', { name: 'Ny måltid' }).tap();
      await expectNoViolations(page, 'Mat ny måltid');
      await page.getByRole('button', { name: 'Avbryt' }).tap();
      await page.getByRole('button', { name: 'Nytt livsmedel' }).tap();
      await expectNoViolations(page, 'Mat nytt livsmedel');
      await page.getByRole('button', { name: 'Historik', exact: true }).tap();
      await expect(page.getByTestId('intake-table')).toBeVisible();
      await expectNoViolations(page, 'Mat historik');
      await page.getByRole('button', { name: 'Näring', exact: true }).tap();
      await expect(page.getByTestId('nutrition')).toBeVisible();
      await expectNoViolations(page, 'Mat näring');
      // Inställningar med profilens nya fält ifyllda.
      await page.goto('./#/installningar/profil');
      await expectNoViolations(page, 'Inställningar profil');
      // Påminnelsen om säkerhetskopia.
      await page.goto('./');
      await expect(page.getByTestId('backup-reminder')).toBeVisible();
      await expectNoViolations(page, 'Påminnelse');
      // Veckokortet och kvittensen från genvägen +250 ml vatten.
      await expect(page.getByTestId('week-card')).toBeVisible();
      await page.goto('./?action=add-water');
      await expect(page.getByTestId('shortcut-toast')).toBeVisible();
      await expectNoViolations(page, 'Veckokort och genvägstoast');
      // Mat → Logga mat (genvägen) med proteinringen.
      await page.goto('./?action=log-food');
      await expect(page.getByRole('dialog', { name: 'Logga mat' })).toBeVisible();
      await expectNoViolations(page, 'Logga mat');
    });

    test('snabblogg, recept och veckobudget saknar tillgänglighetsfel', async ({ page }) => {
      await seedData(page);
      await seed(page, {
        foodLog: [
          {
            id: 'q1',
            date: isoDaysFromToday(0),
            meal: 'frukost',
            foodId: 'snabb:restaurang:850:',
            name: 'Restaurang',
            amount: 1,
            unit: 'portion',
            grams: 100,
            per100: { kcal: 850, proteinG: 0, carbsG: 0, fatG: 0 },
            estimated: true,
            createdAt: Date.now(),
          },
        ],
        recipes: [
          {
            id: 'r1',
            name: 'Linsgryta',
            items: [
              {
                foodId: 'egen:gröt',
                name: 'Gröt',
                amount: 1200,
                unit: 'g',
                grams: 1200,
                per100: { kcal: 90, proteinG: 3, carbsG: 15, fatG: 2 },
              },
            ],
            servings: 6,
            cookedWeightG: 1500,
            createdAt: 1,
          },
        ],
      });
      await page.goto('./#/mat');
      const breakfast = page.getByTestId('meal-frukost').getByRole('heading').getByRole('button');
      if ((await breakfast.getAttribute('aria-expanded')) === 'false') await breakfast.tap();
      await expect(page.getByTestId('estimated-tag')).toBeVisible();
      await expect(page.getByTestId('week-line')).toBeVisible();
      await expectNoViolations(page, 'Mat dag med snabblogg och veckorad');
      await page.getByTestId('week-row').tap();
      await expect(page.getByTestId('week-sheet')).toBeVisible();
      await expectNoViolations(page, 'Veckopanelen');
      await page.getByRole('dialog').getByRole('button', { name: 'Stäng', exact: true }).tap();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.getByRole('button', { name: 'Sök och logga mat' }).tap();
      await page.getByTestId('quick-log-open').getByRole('button').tap();
      await expect(page.getByTestId('quick-log-form')).toBeVisible();
      await expectNoViolations(page, 'Snabblogg');
      await page.getByRole('button', { name: 'Avbryt' }).tap();
      await page.getByRole('button', { name: 'Måltider', exact: true }).tap();
      await page.getByTestId('quick-pick').filter({ hasText: 'Linsgryta' }).tap();
      await expect(page.getByRole('group', { name: 'Snabbval mängd' })).toBeVisible();
      await expectNoViolations(page, 'Logga recept');
      await page.getByRole('button', { name: 'Stäng', exact: true }).tap();
      await page.getByRole('button', { name: 'Egna', exact: true }).tap();
      await page.getByTestId('own-recipe').getByRole('button').first().tap();
      await expect(page.getByTestId('recipe-per-portion')).toBeVisible();
      await expectNoViolations(page, 'Receptformulär');
      await page.goto('./');
      await expect(page.getByTestId('today-card').getByTestId('week-line')).toBeVisible();
      await expectNoViolations(page, 'Översikt veckobudget');
    });

    test('import-förhandsvisning och krypteringsfält saknar tillgänglighetsfel', async ({
      page,
    }) => {
      await seedData(page);
      await page.goto('./#/installningar/sakerhetskopia');
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

    test('vatten, träning och kalenderns vyer saknar tillgänglighetsfel', async ({ page }) => {
      await page.clock.setFixedTime(new Date('2026-09-16T12:00:00'));
      await page.goto('./');
      await seed(page, {
        profile: {
          startDate: '2026-09-01',
          startWeightKg: 82,
          heightCm: 180,
          goalWeightKg: 75,
        },
        water: [{ id: 'v1', date: '2026-09-16', ml: 750, createdAt: 1 }],
        workoutPlans: [
          {
            id: 'plan1',
            type: 'Löpning',
            weekdays: [0, 2, 4],
            time: '07:00',
            durationMin: 30,
            intensity: 'medel',
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
            status: 'hoppad',
            createdAt: 2,
          },
          {
            id: 'w2',
            date: '2026-09-16',
            time: '18:00',
            type: 'Yoga',
            durationMin: 30,
            status: 'planerad',
            createdAt: 3,
          },
        ],
      });
      await page.reload();
      // Översikt med "Blev passet av?", Idag (ring + pass) och Kommande.
      await expect(page.getByTestId('missed-workouts')).toBeVisible();
      await expect(page.getByTestId('upcoming-card').getByTestId('workout')).toHaveCount(3);
      await expectNoViolations(page, 'Översikt med pass och vatten');
      await page.getByTestId('today-card').getByRole('button', { name: /^Klar/ }).tap();
      await expect(page.getByRole('dialog', { name: 'Markera som klar' })).toBeVisible();
      await expectNoViolations(page, 'Markera som klar');
      await page.getByRole('button', { name: 'Stäng' }).tap();

      // Logga: vatten och träning (pass + återkommande).
      await page.goto('./#/logga');
      await openLog(page, 'vatten');
      await expectNoViolations(page, 'Logga vatten');
      await openLog(page, 'traning');
      await expectNoViolations(page, 'Logga pass');
      await page.getByRole('dialog').getByRole('button', { name: 'Återkommande' }).tap();
      await page.getByRole('dialog').getByRole('button', { name: 'måndag' }).tap();
      await expectNoViolations(page, 'Logga återkommande');

      // Kalender: månad med pass i olika status, dagsvy och veckovy.
      await page.goto('./#/kalender');
      await expect(page.getByTestId('calendar-day').getByTestId('workout')).toHaveCount(2);
      await openCalendarLegend(page);
      await expectNoViolations(page, 'Kalender månad');
      // Radmenyn för ett pass.
      await page
        .getByTestId('calendar-day')
        .getByTestId('workout')
        .first()
        .getByRole('button')
        .tap();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expectNoViolations(page, 'Kalender radmeny');
      await page.getByRole('dialog').getByRole('button', { name: 'Stäng', exact: true }).tap();
      await expect(page.getByRole('dialog')).toBeHidden();
      await page.getByRole('button', { name: 'Vecka', exact: true }).tap();
      await expect(page.getByTestId('calendar-week')).toBeVisible();
      await expectNoViolations(page, 'Kalender vecka');

      // Framsteg (vattenhistorik) och Inställningar (vattenmål).
      await page.goto('./#/framsteg');
      await expect(page.getByTestId('water-history')).toBeVisible();
      await expectNoViolations(page, 'Framsteg vatten');
      await page.goto('./#/installningar/dryck');
      await expect(page.getByTestId('water-goal-standard')).toBeVisible();
      await expectNoViolations(page, 'Inställningar vattenmål');
    });

    test('GLP-1: Logga, Översikt, Kalender och Framsteg saknar tillgänglighetsfel', async ({
      page,
    }) => {
      await page.clock.setFixedTime(new Date('2026-09-16T12:00:00'));
      await page.goto('./');
      await seed(page, {
        profile: { startDate: '2026-09-01', startWeightKg: 82, heightCm: 180, goalWeightKg: 75 },
        settings: { features: { glp1: true, version: 3 } },
        weights: [
          { id: 'a', date: '2026-09-02', weightKg: 82, createdAt: 1 },
          { id: 'b', date: '2026-09-15', weightKg: 81, createdAt: 2 },
        ],
        medications: [
          {
            id: 'm',
            name: 'Ozempic',
            frequency: 'vecka',
            weekday: 2,
            time: '08:00',
            steps: [
              { date: '2026-09-02', doseMg: 0.25 },
              { date: '2026-09-09', doseMg: 0.5 },
            ],
            createdAt: 1,
          },
        ],
        injections: [
          {
            id: 'i1',
            date: '2026-09-02',
            medicationId: 'm',
            medicationName: 'Ozempic',
            doseMg: 0.25,
            site: 'buk-vanster',
            createdAt: 2,
          },
          {
            id: 'i2',
            date: '2026-09-09',
            medicationId: 'm',
            medicationName: 'Ozempic',
            doseMg: 0.5,
            createdAt: 3,
          },
        ],
        symptoms: [{ date: '2026-09-16', appetite: 3, sideEffects: ['Trötthet'], createdAt: 4 }],
      });
      await page.reload();
      await expect(page.getByTestId('dose-day-banner')).toBeVisible();
      await expect(page.getByTestId('next-dose')).toBeVisible();
      await expectNoViolations(page, 'Översikt med dosdag');

      await page.goto('./#/logga');
      await openLog(page, 'glp1');
      const sheet = page.getByRole('dialog');
      await expectNoViolations(page, 'Logga dos');
      await sheet.getByRole('button', { name: 'Mående', exact: true }).tap();
      await expectNoViolations(page, 'Logga mående');
      await sheet.getByRole('button', { name: 'Läkemedel', exact: true }).tap();
      await sheet.getByRole('button', { name: 'Lägg till steg' }).tap();
      await expectNoViolations(page, 'Läkemedel och dostrappa');

      await page.goto('./#/kalender');
      await expect(page.getByTestId('calendar-value-glp1')).toBeVisible();
      await expectNoViolations(page, 'Kalender med doser');
      await page.goto('./#/framsteg');
      await expect(page.getByTestId('dose-changes')).toBeVisible();
      await expectNoViolations(page, 'Framsteg med dosbyten');
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
