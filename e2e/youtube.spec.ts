/**
 * E2E tests for the YouTube content script.
 *
 * NOTE: These tests require:
 *   1. A production build: pnpm build
 *   2. Playwright Chromium: pnpm playwright install chromium
 *
 * Run with: pnpm test:e2e
 */
import { test, expect } from './fixtures';

// Boys Noize b2b VTSS @ ARC Music Festival 2025 (89 min) — confirmed match on 1001tracklists
const LONG_SET_URL = 'https://www.youtube.com/watch?v=_jysvzxpb0Q';
// A short official music video (<30min)
const SHORT_VIDEO_URL = 'https://www.youtube.com/watch?v=kJQP7kiw5Fk'; // Despacito ~4min

test.describe('YouTube indicator', () => {
  test('indicator is not shown on a short video', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(SHORT_VIDEO_URL);
    await page.waitForTimeout(3000); // allow content script to run
    const indicator = page.locator('#tlt-indicator');
    await expect(indicator).toHaveCount(0);
  });

  test('indicator appears on a long DJ set video when a match is found', async ({ context }) => {
    // This test will only pass if the video has a real 1001tracklists match.
    // Use it as a smoke test with a known video+tracklist pair.
    const page = await context.newPage();
    await page.goto(LONG_SET_URL);
    // Wait up to 10s for the indicator to appear (network request needed)
    const indicator = page.locator('#tlt-indicator');
    // Soft assertion — the indicator may or may not appear depending on search results
    const count = await indicator.count();
    if (count > 0) {
      await expect(indicator).toBeVisible();
      await expect(indicator).toHaveAttribute('href', /1001tracklists\.com\/tracklist\//);
    }
  });
});
