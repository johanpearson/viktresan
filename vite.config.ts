/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { SHORTCUTS, shortcutUrl } from './src/lib/shortcuts.ts';

const BASE = '/viktresan/';

/**
 * Versionsinformation som visas under Inställningar → Om appen. Deploy-workflowen
 * sätter APP_COMMIT och APP_BUILD_TIME; lokalt läses commit från git.
 */
function buildInfo(): { version: string; commit: string; buildTime: string } {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  let commit = process.env.APP_COMMIT?.slice(0, 7);
  if (!commit) {
    try {
      commit = execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
    } catch {
      commit = 'dev';
    }
  }
  return {
    version: pkg.version,
    commit,
    buildTime: process.env.APP_BUILD_TIME ?? new Date().toISOString(),
  };
}

const BUILD_INFO = buildInfo();

/**
 * Strikt Content Security Policy. Allt laddas från den egna origin:en –
 * inga CDN:er, inga inline-skript. Bilder kan komma från blob:/data: (lokala foton).
 * Enda undantaget är streckkodsuppslag mot Open Food Facts (bara streckkoden skickas).
 * Obs: frame-ancestors stöds inte i meta-taggar och är därför utelämnad.
 */
export const OPEN_FOOD_FACTS = 'https://world.openfoodfacts.org';

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self' ${OPEN_FOOD_FACTS}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/**
 * Lägger in CSP-meta-taggen endast i produktionsbygget. Vites dev-server
 * (React Fast Refresh) kräver inline-skript och skulle annars blockeras.
 */
function cspMetaTag(): Plugin {
  return {
    name: 'viktresan-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const charset = '<meta charset="UTF-8" />';
      if (!html.includes(charset)) throw new Error('index.html saknar <meta charset="UTF-8" />');
      // Direkt efter charset så att policyn gäller för allt som följer i dokumentet.
      return html.replace(
        charset,
        `${charset}\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

/**
 * Endast för e2e (VIKTRESAN_E2E=1, sätts av playwright.config.ts): låtsas att en
 * ny version är deployad för webbläsarkontexter med kakan `e2e-ny-version=1`.
 * sw.js får då ett tillägg (ny byte-sekvens = ny version) som svarar "v2" på
 * meddelandet "version?". Playwright kan inte fånga webbläsarens egen hämtning
 * av sw.js, därför görs det i preview-servern. Påverkar aldrig bygget.
 */
function e2eNewVersion(): Plugin {
  return {
    name: 'viktresan-e2e-new-version',
    configurePreviewServer(server) {
      if (process.env.VIKTRESAN_E2E !== '1') return;
      const swPath = `${server.config.root}/${server.config.build.outDir}/sw.js`;
      server.middlewares.use((req, res, next) => {
        const newVersion = /(?:^|;\s*)e2e-ny-version=1(?:;|$)/.test(req.headers.cookie ?? '');
        if (!newVersion || req.url?.split('?')[0] !== `${BASE}sw.js`) {
          next();
          return;
        }
        const body =
          readFileSync(swPath, 'utf8') +
          "\nself.addEventListener('message', (e) => { if (e.data === 'version?') e.ports[0].postMessage('v2'); });\n";
        res.setHeader('Content-Type', 'text/javascript');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(body);
      });
    },
  };
}

export default defineConfig({
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(BUILD_INFO.version),
    __APP_COMMIT__: JSON.stringify(BUILD_INFO.commit),
    __APP_BUILD_TIME__: JSON.stringify(BUILD_INFO.buildTime),
  },
  plugins: [
    react(),
    cspMetaTag(),
    e2eNewVersion(),
    VitePWA({
      // Ny version tar inte över av sig själv – appen visar "Ny version finns" och
      // användaren väljer när (se src/lib/pwaUpdate.ts, som också registrerar sw.js).
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Viktresan',
        short_name: 'Viktresan',
        description: 'Personlig viktloggning – all data stannar på din enhet.',
        lang: 'sv',
        dir: 'ltr',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f172a',
        theme_color: '#0f766e',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
        // Genvägar på appikonen (långt tryck). Tolkas av src/lib/shortcuts.ts.
        shortcuts: SHORTCUTS.map((s) => ({
          name: s.name,
          short_name: s.shortName,
          description: s.description,
          url: shortcutUrl(BASE, s.id),
          icons: [{ src: s.icon, sizes: '96x96', type: 'image/png' }],
        })),
      },
      workbox: {
        // livsmedel.json = Livsmedelsverkets databas (se scripts/fetch-livsmedel.mjs).
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,json}'],
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
        // Ta kontroll över sidan direkt vid första besöket, så att den fungerar
        // offline utan att först behöva laddas om. En uppdatering väntar däremot
        // (skipWaiting sker först när användaren trycker Uppdatera).
        clientsClaim: true,
        skipWaiting: false,
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
