import { expect, test, type Page } from '@playwright/test';

const SECTIONS = ['Översikt', 'Logga', 'Historik', 'Mat', 'Bilder'] as const;

/** Samlar CSP-överträdelser och konsolfel så att varje test kan kräva noll. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test('startsidan visar Översikt och navigeringen', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');

  await expect(page).toHaveTitle(/Viktresan/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Översikt');
  const nav = page.getByRole('navigation', { name: 'Huvudmeny' });
  for (const label of SECTIONS) {
    await expect(nav.getByRole('link', { name: label })).toBeVisible();
  }
  await expect(nav.getByRole('link')).toHaveCount(5);
  await expect(nav.getByRole('link', { name: 'Inställningar' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('kugghjulet på Översikt öppnar Inställningar', async ({ page }) => {
  await page.goto('./');
  const gear = page.getByLabel('Inställningar');
  const box = await gear.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(48);
  expect(box?.width).toBeGreaterThanOrEqual(48);
  await gear.tap();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inställningar');
  await expect(page).toHaveURL(/#\/installningar$/);
});

test('bottennavigeringen är solid och döljer inget innehåll', async ({ page }) => {
  await page.goto('./#/logga');
  await expect(page.getByRole('button', { name: 'Spara', exact: true })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Huvudmeny' });

  // Helt ogenomskinlig bakgrund.
  const background = await nav.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(background).toMatch(/^rgb\(/);

  // Längst ner på sidan slutar innehållet ovanför navigeringen.
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  const { contentBottom, navTop, paddingBottom, navHeight } = await page.evaluate(() => {
    const main = document.querySelector('.app-main');
    const navEl = document.querySelector('.nav');
    const last = main?.querySelector('.page')?.lastElementChild;
    if (!main || !navEl || !last) throw new Error('saknar element');
    return {
      contentBottom: last.getBoundingClientRect().bottom,
      navTop: navEl.getBoundingClientRect().top,
      paddingBottom: parseFloat(getComputedStyle(main).paddingBottom),
      navHeight: navEl.getBoundingClientRect().height,
    };
  });
  expect(contentBottom).toBeLessThanOrEqual(navTop);
  expect(paddingBottom).toBeGreaterThanOrEqual(navHeight);
});

test('navigering mellan alla sektioner', async ({ page }) => {
  await page.goto('./');
  const nav = page.getByRole('navigation', { name: 'Huvudmeny' });

  for (const label of SECTIONS) {
    const link = nav.getByRole('link', { name: label });
    await link.tap();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
    await expect(link).toHaveAttribute('aria-current', 'page');
  }
});

test('navigeringslänkarna har stora tryckytor', async ({ page }) => {
  await page.goto('./');
  const links = page.getByRole('navigation', { name: 'Huvudmeny' }).getByRole('link');
  for (const link of await links.all()) {
    const box = await link.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(48);
    expect(box?.width).toBeGreaterThanOrEqual(48);
  }
});

test('strikt CSP finns i bygget', async ({ page }) => {
  await page.goto('./');
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain('unsafe-inline');
  expect(csp).not.toContain('unsafe-eval');
  // Enda externa origin: Open Food Facts för streckkodsuppslag.
  expect(csp).toContain("connect-src 'self' https://world.openfoodfacts.org;");
});

test('inga förfrågningar till andra origins', async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? '').origin;
  const external: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.protocol.startsWith('http') && url.origin !== origin) external.push(req.url());
  });
  await page.goto('./');
  await page.waitForLoadState('networkidle');
  // Mat-vyn och sökningen använder bara den lokala livsmedelsdatabasen.
  await page.goto('./#/mat');
  await page.getByLabel('Sök livsmedel').fill('mjölk');
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
});

test('manifestet beskriver en installerbar PWA', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/viktresan/manifest.webmanifest');

  const res = await request.get(href ?? '');
  expect(res.ok()).toBe(true);
  const manifest = (await res.json()) as {
    name: string;
    display: string;
    start_url: string;
    scope: string;
    icons: { src: string; sizes: string; purpose?: string }[];
  };
  expect(manifest.name).toBe('Viktresan');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/viktresan/');
  expect(manifest.scope).toBe('/viktresan/');
  expect(manifest.icons.map((i) => i.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);

  for (const icon of manifest.icons) {
    const iconRes = await request.get(`/viktresan/${icon.src}`);
    expect(iconRes.ok(), icon.src).toBe(true);
  }
});

test('Chrome bedömer appen som installerbar', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const client = await page.context().newCDPSession(page);
  const { installabilityErrors } = await client.send('Page.getInstallabilityErrors');
  // Playwrights kontexter är inkognito, vilket i sig blockerar installation – bortse från det.
  expect(installabilityErrors.filter((e) => e.errorId !== 'in-incognito')).toEqual([]);
});

test('service workern registreras och appen fungerar offline', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Översikt');
  await context.setOffline(false);
});

test('Inställningar visar lagringsstatus', async ({ page }) => {
  await page.goto('./#/installningar');
  const status = page.getByTestId('persistence-status');
  await expect(status).not.toHaveAttribute('data-state', 'loading');
  await expect(status).toHaveText(/beständig/i);
});

test('viktgrafen ritas utan CSP-fel', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Översikt');

  // Seeda IndexedDB direkt; databasen har redan skapats av appen.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('viktresan');
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        reject(req.error ?? new Error('open failed'));
      };
    });
    const tx = db.transaction('weights', 'readwrite');
    const store = tx.objectStore('weights');
    store.put({ id: '1', date: '2026-01-01', weightKg: 82.4, createdAt: 1 });
    store.put({ id: '2', date: '2026-01-08', weightKg: 81.9, createdAt: 2 });
    store.put({ id: '3', date: '2026-01-15', weightKg: 81.1, createdAt: 3 });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = () => {
        reject(tx.error ?? new Error('tx failed'));
      };
    });
    db.close();
  });

  await page.goto('./#/historik');
  await page.getByRole('button', { name: 'Allt' }).tap();
  await expect(page.getByRole('img', { name: /Viktgraf/ }).locator('canvas')).toBeVisible();
  expect(errors).toEqual([]);
});
