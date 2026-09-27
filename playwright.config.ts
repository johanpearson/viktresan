import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/viktresan/`,
    trace: 'on-first-retry',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    { name: 'Pixel 7', use: { ...devices['Pixel 7'] }, testIgnore: /visual\.spec\.ts/ },
    // Visuella regressionstester: körs bara i Playwrights Docker-avbild (npm run test:visual)
    // så att typsnitt och Chromium alltid är desamma som när baslinjerna togs.
    {
      name: 'visual',
      use: { ...devices['Pixel 7'] },
      testMatch: /visual\.spec\.ts/,
      snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
    },
  ],
  // E2E körs mot produktionsbygget så att CSP och service worker testas på riktigt.
  webServer: {
    command: 'npm run build && npm run preview',
    // Slår på preview-serverns låtsade "ny version" (se e2eNewVersion i vite.config.ts).
    env: { VIKTRESAN_E2E: '1' },
    url: `http://localhost:${PORT}/viktresan/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
