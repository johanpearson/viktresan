import { expect, test } from '@playwright/test';
import { collectErrors, isoDaysFromToday } from './helpers.ts';

const SECTIONS = ['Översikt', 'Logga', 'Historik', 'Steg', 'Bilder', 'Inställningar'] as const;

test('appen fungerar i flygplansläge efter första laddningen', async ({ page, context }) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Vänta tills service workern styr sidan (clientsClaim).
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  const failed: string[] = [];
  page.on('requestfailed', (req) => failed.push(req.url()));

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Översikt');

  // Alla sektioner fungerar.
  const nav = page.getByRole('navigation', { name: 'Huvudmeny' });
  for (const label of SECTIONS) {
    await nav.getByRole('link', { name: label }).tap();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
  }

  // Det går att spara data offline.
  await page.goto('./#/installningar');
  await page.getByLabel('Startdatum').fill(isoDaysFromToday(-7));
  await page.getByLabel('Startvikt (kg)').fill('90');
  await page.getByLabel('Längd (cm)').fill('180');
  await page.getByLabel('Målvikt (kg)').fill('80');
  await page.getByRole('button', { name: 'Spara profil' }).tap();
  await expect(page.getByText('Profilen är sparad.')).toBeVisible();
  await page.goto('./#/logga');
  await page.getByLabel('Vikt (kg)').fill('88,5');
  await page.getByRole('button', { name: 'Spara', exact: true }).tap();
  await expect(page.getByRole('status')).toContainText('Sparade 88,5 kg');

  // En ny flik (kallstart) med djuplänk fungerar också offline.
  const second = await context.newPage();
  await second.goto('./#/historik');
  await expect(second.getByRole('heading', { level: 1 })).toHaveText('Historik');
  await second.goto('./');
  await expect(second.getByTestId('current-weight')).toHaveText('88,5 kg');
  // Ikoner och manifest finns i cachen.
  const icon = await second.evaluate(async () => (await fetch('pwa-192x192.png')).ok);
  expect(icon).toBe(true);

  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
  await context.setOffline(false);
});
