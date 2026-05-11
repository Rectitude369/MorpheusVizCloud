import { defineConfig } from '@playwright/test';

/**
 * Playwright config — runs E2E against the actual Electron build, not
 * a browser tab against the Vite dev server (TEST-002).
 *
 * Each spec uses `_electron.launch({ args: ['.'] })` from `@playwright/test`
 * to spawn the packaged main process and assert against the real renderer.
 *
 * Run prerequisites:
 *   1. `npm run build` — produces dist/main + dist/main/preload + dist/renderer
 *   2. `npm run test:e2e`
 */

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false, // Electron apps share global state; serialize for safety.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['html'], ['github']] : 'list',
  timeout: 60_000,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
});
