import { expect, test, type Page } from '@playwright/test';
import { collectErrors, seed, type SeedData } from './helpers.ts';
import { FROZEN_NOW, LIVSMEDEL, TODAY, VISUAL_DATA, daysAgo } from './visualData.ts';

/**
 * Översikt: slimmad vy med fast testdata (visualData.ts, torsdag 24 sep 2026 12:30). Höjden för
 * en vanlig dag, att varje ring och kort leder rätt, Att göra idag och en enda prognostext.
 */

test.use({
  // livsmedel.json mockas; service workern skulle annars svara från sin cache.
  serviceWorkers: 'block',
  locale: 'sv-SE',
  timezoneId: 'Europe/Stockholm',
});

/** En vanlig dag: allt påslaget, veckokortet redan stängt, inget över övre gränsvärdet. */
const NORMAL_DAY: SeedData = {
  ...VISUAL_DATA,
  // D-vitaminet tas inte än idag (annars varningen för övre gränsvärdet).
  supplementLog: (VISUAL_DATA.supplementLog ?? []).filter((x) => x.date !== TODAY),
  settings: {
    ...VISUAL_DATA.settings,
    preferences: { weekCardDismissed: '2026-09-14' },
  },
};

async function open(page: Page, data: SeedData, hash = '') {
  await page.clock.setFixedTime(new Date(FROZEN_NOW));
  await page.route('**/livsmedel.json', (route) => route.fulfill({ json: LIVSMEDEL }));
  // Tom Fineli-databas: testerna bygger på den mockade Livsmedelsverket-datan.
  await page.route('**/fineli.json', (route) =>
    route.fulfill({ json: { format: 'viktresan-livsmedel', foods: [] } }),
  );
  await page.goto('./');
  await seed(page, data);
  await page.goto(`./${hash}`);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

/** Stänger kortet "Ny milstolpe" (milstolpar som nåtts den senaste veckan sparas vid start). */
async function dismissMilestone(page: Page) {
  const card = page.getByTestId('milestone-card');
  if (await card.isVisible()) {
    await card.getByRole('button', { name: 'Stäng milstolpen' }).tap();
    await expect(card).toBeHidden();
  }
}

test('en vanlig dag ryms på ungefär en och en halv skärmhöjd', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, NORMAL_DAY);
  await expect(page.getByTestId('today-card')).toBeVisible();
  await expect(page.getByTestId('todo-card')).toBeVisible();
  await dismissMilestone(page);
  await expect(page.getByTestId('week-card')).toHaveCount(0);
  await expect(page.getByTestId('ul-warning')).toHaveCount(0);
  // Allt som tagits bort från Översikt.
  for (const text of ['Kalorimål', 'Snitt per vecka', 'Kommande', 'Tillskott idag', 'BMI']) {
    await expect(page.getByRole('heading', { name: text })).toHaveCount(0);
  }
  await expect(page.getByTestId('bmi')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ångra senaste' })).toHaveCount(0);
  await expect(page.getByTestId('fiber-note')).toHaveCount(0);

  const { height, viewport } = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    viewport: window.innerHeight,
  }));
  expect(height).toBeLessThanOrEqual(viewport * 1.5);
  expect(errors).toEqual([]);
});

test('viktkortet: trendvikt, en rad under stapeln och tryck → Framsteg → Historik', async ({
  page,
}) => {
  await open(page, NORMAL_DAY);
  const hero = page.getByTestId('hero');
  await expect(hero.getByTestId('trend-weight')).toHaveText('87,5 kg');
  await expect(hero.getByTestId('hero-summary')).toHaveText(
    /^−\d+,\d kg · \d+,\d kg kvar · mål ca [a-zåäö]+\. \d{4}$/,
  );
  // Förklaringen om vätska och salt finns bara bakom info-ikonen.
  await expect(hero).not.toContainText('vätska och salt');
  await hero.getByTestId('trend-info').tap();
  await expect(hero.getByTestId('trend-info-text')).toContainText('vätska och salt');

  await hero.getByTestId('trend-info').tap();
  await expect(hero.getByTestId('trend-info-text')).toHaveCount(0);

  // Prognosens förklaring bakom info-ikonen vid måldatumet.
  await expect(hero).not.toContainText('glykogen');
  await hero.getByTestId('eta-info').tap();
  await expect(hero.getByTestId('eta-info-text')).toContainText('glykogen');
  await expect(hero.getByTestId('eta-info-text')).toContainText('1 % av vikten per vecka');
  await hero.getByTestId('eta-info').tap();
  await expect(hero.getByTestId('eta-info-text')).toHaveCount(0);

  // Hela kortet är tryckytan.
  await hero.tap();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Framsteg');
  const details = page.getByTestId('weight-details');
  await expect(details.getByTestId('bmi')).toHaveText(/^\d+,\d$/);
  await expect(details.getByTestId('forecast')).toHaveText(/^ca /);
  await details.getByText('Hur räknas prognosen?').tap();
  await expect(details.getByTestId('forecast-explanation')).toContainText('vätska och glykogen');
});

test('ingen motsägande prognostext: enligt plan tills trenden räcker', async ({ page }) => {
  // En enda vägning: ingen trendprognos → datum enligt vald takt.
  await open(page, {
    profile: VISUAL_DATA.profile,
    weights: [{ id: 'w1', date: TODAY, weightKg: 91, createdAt: Date.parse(FROZEN_NOW) }],
  });
  const eta = page.getByTestId('goal-eta');
  await expect(eta).toHaveAttribute('data-kind', 'plan');
  await expect(eta).toHaveText(/^mål ca [a-zåäö]+\. \d{4} enligt plan$/);
  await expect(page.locator('body')).not.toContainText('Logga några mätningar');
  await expect(page.getByText(/mål ca/)).toHaveCount(1);

  // Med fyra veckors vägningar: trendbaserad prognos, utan "enligt plan".
  await open(page, NORMAL_DAY);
  await expect(page.getByTestId('goal-eta')).toHaveAttribute('data-kind', 'trend');
  await expect(page.getByTestId('goal-eta')).not.toContainText('enligt plan');
  await expect(page.getByText(/mål ca/)).toHaveCount(1);
  await expect(page.locator('body')).not.toContainText('Logga några mätningar');
});

test('snabbare takt än taket: prognosen utgår från en hållbar takt', async ({ page }) => {
  // −0,3 kg/dag (−2,1 kg/vecka) i 40 dagar; taket = max(0,5; 1 % av trendvikten) ≈ 0,9 kg/vecka.
  const weights = Array.from({ length: 41 }, (_, k) => ({
    id: `w${String(k)}`,
    date: daysAgo(40 - k),
    weightKg: Math.round((100 - k * 0.3) * 10) / 10,
    createdAt: Date.parse(FROZEN_NOW) - (40 - k) * 864e5,
  }));
  await open(page, {
    profile: {
      ...VISUAL_DATA.profile,
      startDate: daysAgo(40),
      startWeightKg: 100,
      goalWeightKg: 70,
    },
    weights,
  });
  await expect(page.getByTestId('goal-eta')).toHaveAttribute('data-kind', 'trend');
  await expect(page.getByTestId('goal-eta-capped')).toHaveText(
    'Takten är just nu snabbare än planerat, prognosen utgår från en hållbar takt.',
  );
  await page.getByTestId('hero').tap();
  await expect(page.getByTestId('weight-details')).toContainText('Med hållbar takt');
});

test('varje ring och kort navigerar rätt', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, NORMAL_DAY);
  const sheet = page.getByRole('dialog');
  const close = () => sheet.getByRole('button', { name: 'Stäng', exact: true }).tap();

  // Dryck → panelen med snabbvalen (loggar direkt).
  await page.getByRole('button', { name: 'Dryck – logga dryck' }).tap();
  await expect(sheet).toHaveAccessibleName('Dryck idag');
  await expect(page.getByTestId('water-ring')).toHaveAttribute('aria-valuetext', /^950 ml/);
  await sheet.getByRole('button', { name: /\+250 ml/ }).tap();
  await expect(page.getByTestId('water-ring')).toHaveAttribute('aria-valuetext', /^1 200 ml/);
  await expect(sheet.getByRole('button', { name: 'Ångra senaste' })).toBeEnabled();
  await close();
  await expect(sheet).toBeHidden();

  // Kalorier → kalorimålet: mål, takt, förbrukning och "Så räknas målet ut".
  await page.getByRole('button', { name: 'Kalorier – visa kalorimålet' }).tap();
  await expect(sheet).toHaveAccessibleName('Kalorimål');
  await expect(sheet.getByTestId('calorie-target')).toHaveText('1 680 kcal');
  await expect(sheet.getByTestId('plan-rate')).toBeVisible();
  await expect(sheet.getByTestId('plan-tdee')).toBeVisible();
  await sheet.getByText('Så räknas målet ut').tap();
  await expect(sheet.getByTestId('plan-source')).toBeVisible();
  await close();
  await expect(sheet).toBeHidden();

  // Protein och fiber → Mat → Näring med kortet Protein och fiber (fibernotisen hör hemma här).
  for (const name of ['Protein – visa näring', 'Fiber – visa näring']) {
    await page.getByRole('link', { name }).tap();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mat');
    await expect(page.getByRole('button', { name: 'Näring' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('nutrition-macros')).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Översikt');
  }
  await page.getByRole('link', { name: 'Fiber – visa näring' }).tap();
  await expect(page.getByTestId('nutrition-fiber')).toBeVisible();
  await page.goBack();

  // Veckoraden (en rad) → veckopanelen.
  await expect(page.getByTestId('week-row-text')).toHaveText(
    /^Vecka: [\d ]+ kcal (kvar|över)( · ≈ [\d ]+\/dag)?$/,
  );
  await page.getByTestId('week-row').tap();
  await expect(page.getByTestId('week-sheet')).toBeVisible();
  await close();
  await expect(sheet).toBeHidden();

  // Steg-chipet → Logga → Steg.
  await page.getByTestId('today-steg').tap();
  await expect(sheet).toHaveAccessibleName('Logga steg');
  await close();
  await expect(page).toHaveURL(/#\/logga$/);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Översikt');

  // Att göra idag: dosen → Logga → GLP-1.
  await page.getByTestId('todo-dose').getByRole('link').tap();
  await expect(sheet).toHaveAccessibleName(/GLP-1/);
  await close();
  await expect(page).toHaveURL(/#\/logga$/);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Översikt');

  // Ny milstolpe → Framsteg → Milstolpar.
  const milestone = page.getByTestId('milestone-card');
  if (await milestone.isVisible()) {
    await milestone.getByRole('link').tap();
    await expect(page.getByTestId('reached-milestones')).toBeVisible();
    await page.goBack();
  }
  expect(errors).toEqual([]);
});

test('förra veckan: kontextkortet leder till Framsteg → Veckor och kan stängas', async ({
  page,
}) => {
  await open(page, VISUAL_DATA);
  const card = page.getByTestId('week-card');
  await expect(card.getByTestId('week-headline')).not.toBeEmpty();
  await card.getByRole('link').tap();
  await expect(page.getByTestId('week-list')).toBeVisible();
  // Snittvikten (tidigare "Snitt per vecka" på Översikt) finns på raden.
  await expect(page.getByTestId('week').first()).toContainText(/snitt \d+,\d kg/);
  await page.goBack();
  await page.getByRole('button', { name: 'Stäng veckosummeringen' }).tap();
  await expect(card).toHaveCount(0);
});

test('Att göra idag försvinner när allt är klart', async ({ page }) => {
  // Utan läkemedel (ingen dosdag); säkerhetskopian är gjord i förrgår.
  await open(page, { ...NORMAL_DAY, medications: [], injections: [] });
  const todo = page.getByTestId('todo-card');
  await expect(todo).toBeVisible();

  // Tillskott: tryck på raden = tagen (med Ångra), "Alla tagna" bockar av resten.
  const supplements = todo.getByTestId('todo-supplement');
  const count = await supplements.count();
  expect(count).toBeGreaterThan(0);
  await supplements.first().getByRole('button').tap();
  await expect(page.getByTestId('supplement-toast')).toBeVisible();
  await expect(supplements).toHaveCount(count - 1);
  if (count > 2) await todo.getByTestId('todo-all-taken').tap();
  else if (count === 2) await supplements.first().getByRole('button').tap();
  await expect(supplements).toHaveCount(0);

  // Pass: dagens hoppas över, det obesvarade blev av.
  const menu = page.getByRole('dialog');
  await todo.getByTestId('todo-workout').getByRole('button').tap();
  await menu.getByRole('button', { name: 'Hoppa över' }).tap();
  await expect(todo.getByTestId('todo-workout')).toHaveCount(0);
  const unanswered = todo.getByTestId('todo-unanswered');
  for (let n = await unanswered.count(); n > 0; n--) {
    await unanswered.first().getByRole('button').tap();
    await menu.getByRole('button', { name: 'Hoppade över' }).tap();
    await expect(unanswered).toHaveCount(n - 1);
  }
  await expect(todo).toHaveCount(0);
  await expect(page.getByTestId('todo-done')).toHaveText('Allt klart för idag');
});

test('dosdag i Att göra idag; annars raden Nästa dos längst ner', async ({ page }) => {
  await open(page, NORMAL_DAY);
  await expect(page.getByTestId('todo-dose')).toContainText('Dos idag');
  await expect(page.getByTestId('todo-next-dose')).toHaveCount(0);

  // Dosen loggad → Nästa dos om en vecka, med dos och ställe.
  await seed(page, {
    injections: [
      {
        id: 'idag',
        medicationId: 'med1',
        medicationName: 'Wegovy',
        date: TODAY,
        time: '08:00',
        doseMg: 0.5,
        site: 'buk-vanster',
        createdAt: Date.parse(FROZEN_NOW),
      },
    ],
  });
  await page.reload();
  await expect(page.getByTestId('todo-dose')).toHaveCount(0);
  const next = page.getByTestId('todo-next-dose');
  await expect(next).toHaveText(/^Nästa dos [a-zåäö]{3} \d+ [a-zåäö]+ · [\d,]+ mg · [a-zåäö ]+$/);
  await next.tap();
  await expect(page.getByRole('dialog')).toHaveAccessibleName(/GLP-1/);
  await expect(page.getByTestId('next-dose')).toBeVisible();
});

test('Inställningar → Översikt döljer ringar och kort', async ({ page }) => {
  await open(page, NORMAL_DAY, '#/installningar/oversikt');
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('switch', { name: 'Fiber' }).uncheck();
  await sheet.getByRole('switch', { name: 'Att göra idag' }).uncheck();
  await sheet.getByRole('switch', { name: 'Veckoraden' }).uncheck();
  await sheet.getByRole('button', { name: 'Stäng', exact: true }).tap();
  await expect(page.getByTestId('settings-oversikt')).toContainText('3 dolda');

  await page.goto('./');
  await expect(page.getByTestId('kcal-ring')).toBeVisible();
  await expect(page.getByTestId('fiber-ring')).toHaveCount(0);
  await expect(page.getByTestId('week-line')).toHaveCount(0);
  await expect(page.getByTestId('todo-card')).toHaveCount(0);
  await expect(page.getByTestId('todo-done')).toHaveCount(0);
});
