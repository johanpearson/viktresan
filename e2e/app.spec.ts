import { expect, test, type Page } from '@playwright/test';

const SECTIONS = ['Översikt', 'Logga', 'Bilder', 'Historik', 'Inställningar'] as const;

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
  expect(errors).toEqual([]);
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

test('viktkurvan ritas utan CSP-fel', async ({ page }) => {
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

  await page.reload();
  await expect(page.getByRole('img', { name: 'Viktkurva' }).locator('canvas')).toBeVisible();
  expect(errors).toEqual([]);
});
