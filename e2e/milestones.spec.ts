import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, dump, isoDaysFromToday, openLog, seed } from './helpers.ts';

const PROFILE = {
  startDate: isoDaysFromToday(-30),
  startWeightKg: 90,
  heightCm: 180,
  goalWeightKg: 80,
  sex: 'kvinna',
  birthYear: 1985,
  activityLevel: 'latt',
  ratePerWeekKg: 0.5,
};

async function start(page: Page, data: Parameters<typeof seed>[1] = { profile: PROFILE }) {
  await page.goto('./');
  await seed(page, data);
  // Omladdning: redan passerade milstolpar markeras vid start, utan firande.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Översikt');
}

async function logWeight(page: Page, weight: string) {
  await page.goto('./#/logga');
  await openLog(page, 'vikt');
  await page.getByLabel('Vikt (kg)').fill(weight);
  await page.getByRole('button', { name: 'Spara', exact: true }).tap();
  await expect(page.getByText(`Sparade ${weight},0 kg`)).toBeVisible();
}

async function expectNoViolations(page: Page, label: string) {
  // Kontrasten mäts när animationerna (och konfettin) är klara.
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
  await page.waitForTimeout(3000);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  expect(
    results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) })),
    label,
  ).toEqual([]);
}

test('5 kg: helskärmsfirandet visas en gång och milstolpen hamnar i listan', async ({ page }) => {
  const errors = collectErrors(page);
  // Mål 70 kg: halvvägs (80 kg) ligger längre bort än 5 kg.
  await start(page, { profile: { ...PROFILE, goalWeightKg: 70 } });

  // 90 → 85 kg når 1 kg, 5 kg och 5 %. Den största firas, de andra nämns.
  await logWeight(page, '85');
  const overlay = page.getByTestId('celebration');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute('data-milestone', 'kg-5');
  await expect(overlay.getByRole('heading', { name: '5 kg lättare' })).toBeVisible();
  await expect(overlay).toContainText('smör');
  await expect(overlay).toContainText('2 milstolpar till');
  await expectNoViolations(page, 'Firande');

  // Ett tryck var som helst stänger.
  await overlay.tap({ position: { x: 20, y: 20 } });
  await expect(overlay).toBeHidden();
  await expect(page.getByTestId('milestone-toast')).toBeHidden();

  // Samma nivå igen – och efter omladdning – firas inte en gång till.
  await page.getByRole('button', { name: 'Spara', exact: true }).tap();
  await page.waitForTimeout(800);
  await expect(overlay).toBeHidden();
  await page.reload();
  await page.waitForTimeout(800);
  await expect(overlay).toBeHidden();

  const stored = (await dump(page)).milestones as { id: string; date: string }[];
  expect(stored.map((m) => m.id)).toEqual(['kg-1', 'kg-5', 'procent-5']);
  for (const m of stored) expect(m.date).toBe(isoDaysFromToday(0));

  // Framsteg → Milstolpar: uppnådda med datum och tre kommande.
  await page.goto('./#/framsteg/milstolpar');
  const reached = page.getByTestId('reached-milestones');
  await expect(reached.locator('[data-milestone="kg-5"]')).toContainText('5 kg lättare');
  await expect(reached.getByRole('listitem')).toHaveCount(3);
  await expect(page.getByTestId('upcoming-milestones').getByRole('listitem')).toHaveCount(3);
  await expectNoViolations(page, 'Milstolpar');
  expect(errors).toEqual([]);
});

test('mindre milstolpe: diskret toast som stängs med tryck', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await logWeight(page, '89');
  const toast = page.getByTestId('milestone-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toHaveAttribute('data-milestone', 'kg-1');
  await expect(toast).toContainText('Första kilot');
  await expect(page.getByTestId('celebration')).toBeHidden();
  await expectNoViolations(page, 'Toast');
  await toast.tap();
  await expect(toast).toBeHidden();
  expect(errors).toEqual([]);
});

test('mål nått: välj att hålla vikten (takt 0, kalorimål = förbrukningen)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, {
    profile: { ...PROFILE, goalWeightKg: 88 },
    // Redan nådda milstolpar (1 kg) ska inte firas igen.
    weights: [{ id: 'a', date: isoDaysFromToday(-1), weightKg: 88.9, createdAt: 1 }],
  });
  await logWeight(page, '80');
  const overlay = page.getByTestId('celebration');
  await expect(overlay).toHaveAttribute('data-milestone', 'mal-88');
  await expect(overlay.getByRole('link', { name: 'Sätt ett nytt mål' })).toBeVisible();
  await overlay.getByRole('button', { name: 'Håll vikten' }).tap();
  await expect(overlay).toContainText('Kalorimålet motsvarar nu din förbrukning');
  await overlay.getByRole('button', { name: 'Stäng' }).tap();
  await expect(overlay).toBeHidden();
  expect(((await dump(page)).profile as { ratePerWeekKg: number }).ratePerWeekKg).toBe(0);

  await page.goto('./');
  await expect(page.getByTestId('plan-rate')).toHaveText('Håll vikten');
  await expect(page.getByTestId('calorie-target')).toHaveText(
    (await page.getByTestId('plan-tdee').textContent()) ?? '',
  );
  expect(errors).toEqual([]);
});

test.describe('prefers-reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('kortet visas utan animation', async ({ page }) => {
    await start(page, { profile: { ...PROFILE, goalWeightKg: 70 } });
    await logWeight(page, '85');
    const overlay = page.getByTestId('celebration');
    await expect(overlay).toBeVisible();
    const animation = await overlay
      .locator('.celebration-card')
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(animation).toBe('none');
    // Ingen konfetti ritas.
    const drawn = await overlay.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext('2d');
      if (!ctx || canvas.width === 0) return false;
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data.some((v) => v !== 0);
    });
    expect(drawn).toBe(false);
  });
});

test('import av historik markerar milstolpar utan att fira dem', async ({ page }) => {
  await page.goto('./');
  // Ett halvår av data importeras genom att skrivas direkt och sedan starta om appen.
  await seed(page, {
    profile: PROFILE,
    weights: Array.from({ length: 30 }, (_, i) => ({
      id: `w${String(i)}`,
      date: isoDaysFromToday(-60 + i),
      weightKg: 89 - i * 0.2,
      createdAt: i,
    })),
  });
  await page.reload();
  await expect
    .poll(async () => ((await dump(page)).milestones as { id: string }[]).map((m) => m.id))
    .toContain('kg-5');
  await expect(page.getByTestId('celebration')).toBeHidden();
  await expect(page.getByTestId('milestone-toast')).toBeHidden();
});
