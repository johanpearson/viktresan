/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const BASE = '/viktresan/';

/**
 * Strikt Content Security Policy. Allt laddas från den egna origin:en –
 * inga CDN:er, inga inline-skript. Bilder kan komma från blob:/data: (lokala foton).
 * Obs: frame-ancestors stöds inte i meta-taggar och är därför utelämnad.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
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

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    cspMetaTag(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
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
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
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
