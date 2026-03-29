import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  use: {
    headless: false, // Extensions require a headed browser
  },
  // E2E tests are run sequentially (persistent context is not thread-safe)
  workers: 1,
});
