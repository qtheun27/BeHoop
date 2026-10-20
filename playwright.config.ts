import { defineConfig, devices } from '@playwright/test';
// Tests de bout en bout : appli en mode émulateur Firebase + données du match test (npm run test:e2e)
export default defineConfig({
  testDir: 'tests/e2e', timeout: 60_000, retries: 0, reporter: 'list',
  use: { baseURL: 'http://localhost:5174', ...devices['iPhone 13'], browserName: 'chromium', locale: 'fr-BE', ...(process.env.PW_CHROME ? { launchOptions: { executablePath: process.env.PW_CHROME } } : {}) },
  webServer: { command: 'VITE_USE_EMULATOR=1 npx vite --config web/vite.config.ts --port 5174 --strictPort', url: 'http://localhost:5174/app/', reuseExistingServer: true, timeout: 60_000 },
});
