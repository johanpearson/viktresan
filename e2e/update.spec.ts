import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { collectErrors, sendToBackground } from './helpers.ts';

/**
 * Simulerar en ny deploy för den här kontexten: preview-servern serverar då en
 * sw.js med ett tillägg (ny byte-sekvens = ny version) som svarar "v2" på
 * meddelandet "version?". Se e2eNewVersion i vite.config.ts.
 */
async function deployNewVersion(context: BrowserContext, baseURL: string | undefined) {
  await context.addCookies([{ name: 'e2e-ny-version', value: '1', url: baseURL ?? '' }]);
}

/** Letar webbläsaren efter en ny service worker just nu? */
async function hasNewWorker(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg?.installing != null || reg?.waiting != null;
  });
}

async function controlledPage(page: Page) {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

async function askVersion(page: Page): Promise<unknown> {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (e) => {
          resolve(e.data);
        };
        setTimeout(() => {
          resolve('v1');
        }, 2000);
        navigator.serviceWorker.controller?.postMessage('version?', [channel.port2]);
      }),
  );
}

test('sw.js och index.html blockerar inte uppdateringar', async ({ page, request }) => {
  await controlledPage(page);
  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return { updateViaCache: r?.updateViaCache, script: r?.active?.scriptURL };
  });
  // sw.js hämtas alltid förbi HTTP-cachen.
  expect(reg.updateViaCache).toBe('none');
  expect(reg.script).toMatch(/\/viktresan\/sw\.js$/);

  const sw = await (await request.get('sw.js')).text();
  // sw.js själv ligger aldrig i precachen; index.html har en revision så att
  // en ny build alltid ger en ny sw.js.
  expect(sw).not.toMatch(/url:"sw\.js"/);
  expect(sw).toMatch(/url:"index\.html",revision:"[0-9a-f]+"/);
  // Ny version väntar tills användaren trycker Uppdatera.
  expect(sw).toContain('SKIP_WAITING');
  expect(sw).toContain('clientsClaim');
});

test('ny version: toast, Uppdatera tar över och laddar om', async ({ page, context, baseURL }) => {
  const errors = collectErrors(page);
  await controlledPage(page);
  expect(await askVersion(page)).toBe('v1');
  await deployNewVersion(context, baseURL);

  await page.goto('./#/installningar');
  await page.getByRole('button', { name: 'Sök efter uppdatering' }).tap();
  await expect(page.getByTestId('update-check-result')).toHaveText(/Ny version finns/);
  const toast = page.getByTestId('update-toast');
  await expect(toast).toContainText('Ny version finns');
  // Den nya workern väntar – den gamla styr fortfarande sidan.
  expect(await askVersion(page)).toBe('v1');

  await page.evaluate(() => {
    sessionStorage.setItem('fore-uppdatering', '1');
    Object.assign(window, { foreUppdatering: true });
  });
  await toast.getByRole('button', { name: 'Uppdatera' }).tap();
  // Sidan laddas om (fönstervariabeln försvinner, sessionen finns kvar).
  await page.waitForFunction(() => !('foreUppdatering' in window));
  expect(await page.evaluate(() => sessionStorage.getItem('fore-uppdatering'))).toBe('1');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inställningar');
  await expect(toast).toHaveCount(0);
  expect(await askVersion(page)).toBe('v2');
  await expect(page.getByTestId('app-version')).not.toBeEmpty();
  expect(errors).toEqual([]);
});

test('uppdatering söks när appen blir synlig, högst var 30:e minut', async ({
  page,
  context,
  baseURL,
}) => {
  await controlledPage(page);
  await deployNewVersion(context, baseURL);

  // Nyss sökt vid start → ingen ny sökning.
  await sendToBackground(page);
  await page.waitForTimeout(1000);
  expect(await hasNewWorker(page)).toBe(false);
  await expect(page.getByTestId('update-toast')).toHaveCount(0);

  // 31 minuter senare.
  await page.clock.setFixedTime(Date.now() + 31 * 60 * 1000);
  await sendToBackground(page);
  const toast = page.getByTestId('update-toast');
  await expect(toast).toContainText('Ny version finns');
  expect(await hasNewWorker(page)).toBe(true);
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  // "Senare" döljer toasten; den nya versionen väntar kvar.
  await toast.getByRole('button', { name: 'Senare' }).tap();
  await expect(toast).toHaveCount(0);
  expect(await askVersion(page)).toBe('v1');
});

test('en väntande version visas direkt vid nästa start', async ({ page, context, baseURL }) => {
  await controlledPage(page);
  await deployNewVersion(context, baseURL);
  await page.reload();
  await expect(page.getByTestId('update-toast')).toContainText('Ny version finns');
});

test('Om appen visar version, commit och byggtid samt sidfot', async ({ page }) => {
  await page.goto('./#/installningar');
  await expect(page.getByTestId('app-version')).toHaveText(/^\d+\.\d+\.\d+$/);
  await expect(page.getByTestId('app-commit')).toHaveText(/^([0-9a-f]{7}|dev)$/);
  await expect(page.getByTestId('app-build-time').locator('time')).toHaveAttribute(
    'datetime',
    /^\d{4}-\d{2}-\d{2}T/,
  );
  await expect(page.getByTestId('app-footer')).toHaveText(/^Viktresan \d+\.\d+\.\d+ \(\S+\)$/);
});
