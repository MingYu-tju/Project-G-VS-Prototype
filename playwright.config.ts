import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 60000,
  expect: { timeout: 15000 },
  workers: 1,
  outputDir: '.artifacts/playwright',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    headless: true,
    viewport: { width: 1280, height: 800 },
    launchOptions: { channel: process.env.BROWSER_CHANNEL || 'chrome', args: ['--enable-unsafe-swiftshader'] },
    screenshot: 'only-on-failure',
  },
  webServer: [
    { command: 'npm run dev -- --strictPort', url: 'http://127.0.0.1:3000', reuseExistingServer: false },
    { command: 'node --import tsx src/server/index.ts', url: 'http://127.0.0.1:2567/healthz', reuseExistingServer: false },
  ],
});
