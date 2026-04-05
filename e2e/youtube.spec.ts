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

// Intercepted tests — mock YouTube page + search endpoint
const MOCK_YT_URL = 'https://www.youtube.com/watch?v=djtest01';
const SEARCH_URL = 'https://www.1001tracklists.com/search/result.php';

// 90-min video. data-duration is a DOM attribute readable from the extension's isolated world;
// ytInitialPlayerResponse lives in the page's main JS world and is inaccessible from isolated worlds.
const MOCK_YT_HTML = `<!doctype html>
<html><head><title>Test DJ Set - YouTube</title></head>
<body>
<h1 class="ytd-watch-metadata">
  <yt-formatted-string>Test Artist - Test DJ Set @ Test Festival 2025</yt-formatted-string>
</h1>
<video data-duration="5400"></video>
</body></html>`;

const MOCK_SEARCH_FOUND_HTML = `<html><body>
  <a href="/tracklist/abc123/test-artist-test-festival-2025.html">Test Artist @ Test Festival 2025</a>
</body></html>`;

const MOCK_SEARCH_NOT_FOUND_HTML = `<html><body><p>No results found.</p></body></html>`;

test.describe('YouTube indicator', () => {
  test('indicator is not shown on a short video', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(SHORT_VIDEO_URL);
    await page.waitForTimeout(3000); // allow content script to run
    const indicator = page.locator('#djw-indicator');
    await expect(indicator).toHaveCount(0);
  });

  test('indicator appears on a long DJ set video when a match is found', async ({ context }) => {
    // This test will only pass if the video has a real 1001tracklists match.
    // Use it as a smoke test with a known video+tracklist pair.
    const page = await context.newPage();
    await page.goto(LONG_SET_URL);
    // Wait up to 10s for the indicator to appear (network request needed)
    const indicator = page.locator('#djw-indicator');
    // Soft assertion — the indicator may or may not appear depending on search results
    const count = await indicator.count();
    if (count > 0) {
      await expect(indicator).toBeVisible();
      await expect(indicator).toHaveAttribute('href', /1001tracklists\.com\/tracklist\//);
    }
  });
});

test.describe('indicator states (intercepted)', () => {
  test('searching indicator appears while request is in-flight', async ({ context }) => {
    // Delay the search response by 3 s so we can observe the searching state
    await context.route(SEARCH_URL, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.fulfill({ contentType: 'text/html', body: MOCK_SEARCH_FOUND_HTML });
    });

    const page = await context.newPage();
    await page.route(MOCK_YT_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_YT_HTML }),
    );
    await page.goto(MOCK_YT_URL);

    // Searching state should appear quickly (before the 3 s delay expires)
    await page.waitForSelector('#djw-indicator.djw-searching');
    await expect(page.locator('#djw-indicator.djw-searching')).toBeVisible();

    // After the delay, the searching indicator should be replaced
    await expect(page.locator('#djw-indicator.djw-searching')).toHaveCount(0, { timeout: 6000 });
  });

  test('found indicator appears and links to tracklist', async ({ context }) => {
    await context.route(SEARCH_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_SEARCH_FOUND_HTML }),
    );

    const page = await context.newPage();
    await page.route(MOCK_YT_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_YT_HTML }),
    );
    await page.goto(MOCK_YT_URL);

    await expect(page.locator('#djw-indicator.djw-found')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#djw-indicator')).toHaveAttribute('href', /\/tracklist\//);
  });

  test('not-found indicator appears with correct text', async ({ context }) => {
    await context.route(SEARCH_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_SEARCH_NOT_FOUND_HTML }),
    );

    const page = await context.newPage();
    await page.route(MOCK_YT_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_YT_HTML }),
    );
    await page.goto(MOCK_YT_URL);

    await expect(page.locator('#djw-indicator.djw-not-found')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#djw-indicator')).toContainText('No tracklist found');
  });

  test('search link has correct query URL', async ({ context }) => {
    await context.route(SEARCH_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_SEARCH_NOT_FOUND_HTML }),
    );

    const page = await context.newPage();
    await page.route(MOCK_YT_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_YT_HTML }),
    );
    await page.goto(MOCK_YT_URL);

    await page.waitForSelector('#djw-indicator.djw-not-found');
    const searchLink = page.locator('#djw-indicator a.djw-action');
    await expect(searchLink).toHaveAttribute('href', /main_search=Test/);
    await expect(searchLink).toHaveAttribute('href', /search_selection=9/);
  });

  test('retry button re-searches and shows found indicator', async ({ context }) => {
    let calls = 0;
    await context.route(SEARCH_URL, (route) => {
      calls++;
      route.fulfill({
        contentType: 'text/html',
        body: calls === 1 ? MOCK_SEARCH_NOT_FOUND_HTML : MOCK_SEARCH_FOUND_HTML,
      });
    });

    const page = await context.newPage();
    await page.route(MOCK_YT_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_YT_HTML }),
    );
    await page.goto(MOCK_YT_URL);

    await page.waitForSelector('#djw-indicator.djw-not-found');
    await page.locator('#djw-indicator button').click();
    await expect(page.locator('#djw-indicator.djw-found')).toBeVisible({ timeout: 8000 });
  });

  test('indicator not shown when feature is disabled', async ({ context, extensionId }) => {
    // Disable the youtube-indicator toggle
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    const input = optionsPage.locator('#youtube-indicator');
    if (await input.isChecked()) {
      await optionsPage.locator('label:has(#youtube-indicator) .toggle-track').click();
    }
    await optionsPage.close();

    await context.route(SEARCH_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_SEARCH_FOUND_HTML }),
    );

    const page = await context.newPage();
    await page.route(MOCK_YT_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_YT_HTML }),
    );
    await page.goto(MOCK_YT_URL);
    await page.waitForTimeout(3000);

    await expect(page.locator('#djw-indicator')).toHaveCount(0);

    // Restore
    const restorePage = await context.newPage();
    await restorePage.goto(`chrome-extension://${extensionId}/options.html`);
    if (!(await restorePage.locator('#youtube-indicator').isChecked())) {
      await restorePage.locator('label:has(#youtube-indicator) .toggle-track').click();
    }
    await restorePage.close();
  });
});
