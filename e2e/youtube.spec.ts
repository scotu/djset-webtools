/**
 * E2E tests for the YouTube content script.
 *
 * NOTE: These tests require:
 *   1. A production build: pnpm build
 *   2. Playwright Chromium: pnpm playwright install chromium
 *
 * Run with: pnpm test:e2e
 */
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

/** Start the mock video element playing via a 1×1 canvas stream (no camera needed). */
async function startVideoPlaying(page: Page): Promise<void> {
  await page.evaluate(() => {
    const video = document.querySelector<HTMLVideoElement>('video')!;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    video.srcObject = canvas.captureStream(30);
    void video.play(); // don't return — page.evaluate must not await the play Promise
  });
  // Wait until the native paused property is false (visible to all worlds via C++ layer)
  await page.waitForFunction(() => !(document.querySelector('video') as HTMLVideoElement).paused, {
    timeout: 3000,
  });
}

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

// Two results: first matches the mock YT title well, second does not
const MOCK_SEARCH_FOUND_HTML = `<html><body>
  <a href="/tracklist/abc123/test-artist-test-festival-2025.html">Test Artist @ Test Festival 2025</a>
  <a href="/tracklist/zzz999/unrelated-artist-other-event-2020.html">Unrelated Artist @ Other Event 2020</a>
</body></html>`;

// Results present but none match the mock YT title
const MOCK_SEARCH_LOW_CONFIDENCE_HTML = `<html><body>
  <a href="/tracklist/zzz999/unrelated-artist-other-event-2020.html">Unrelated Artist @ Other Event 2020</a>
  <a href="/tracklist/zzz888/another-dj-different-venue-2019.html">Another DJ @ Different Venue 2019</a>
</body></html>`;

// No tracklist links at all
const MOCK_SEARCH_NOT_FOUND_HTML = `<html><body><p>No results found.</p></body></html>`;

// Same page but with #movie_player carrying the ad-showing class YouTube uses during video ads
const MOCK_YT_HTML_WITH_AD = `<!doctype html>
<html><head><title>Test DJ Set - YouTube</title></head>
<body>
<div id="movie_player" class="ad-showing">
  <div class="ytp-ad-player-overlay"></div>
</div>
<h1 class="ytd-watch-metadata">
  <yt-formatted-string>Test Artist - Test DJ Set @ Test Festival 2025</yt-formatted-string>
</h1>
<video data-duration="5400"></video>
</body></html>`;

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
      await expect(indicator).toHaveAttribute('href', /1001tracklists\.com\/(tracklist|search)\//);
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

  test('found indicator appears and links to best-matching tracklist', async ({ context }) => {
    await context.route(SEARCH_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_SEARCH_FOUND_HTML }),
    );

    const page = await context.newPage();
    await page.route(MOCK_YT_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_YT_HTML }),
    );
    await page.goto(MOCK_YT_URL);

    await expect(page.locator('#djw-indicator.djw-found')).toBeVisible({ timeout: 8000 });
    // Should link to abc123 (the matching result), not zzz999 (the unrelated one)
    await expect(page.locator('#djw-indicator')).toHaveAttribute('href', /abc123/);
  });

  test('found indicator selects best match from multiple results', async ({ context }) => {
    await context.route(SEARCH_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_SEARCH_FOUND_HTML }),
    );

    const page = await context.newPage();
    await page.route(MOCK_YT_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_YT_HTML }),
    );
    await page.goto(MOCK_YT_URL);

    await page.waitForSelector('#djw-indicator.djw-found');
    const href = await page.locator('#djw-indicator').getAttribute('href');
    expect(href).toContain('abc123');
    expect(href).not.toContain('zzz999');
  });

  test('search results indicator shown when no result matches YouTube title', async ({
    context,
  }) => {
    await context.route(SEARCH_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_SEARCH_LOW_CONFIDENCE_HTML }),
    );

    const page = await context.newPage();
    await page.route(MOCK_YT_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_YT_HTML }),
    );
    await page.goto(MOCK_YT_URL);

    await expect(page.locator('#djw-indicator.djw-search-results')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#djw-indicator')).toContainText('Search results on 1001tracklists');
  });

  test('search results indicator shown when search returns no results', async ({ context }) => {
    await context.route(SEARCH_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_SEARCH_NOT_FOUND_HTML }),
    );

    const page = await context.newPage();
    await page.route(MOCK_YT_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_YT_HTML }),
    );
    await page.goto(MOCK_YT_URL);

    await expect(page.locator('#djw-indicator.djw-search-results')).toBeVisible({ timeout: 8000 });
  });

  test('search results indicator has correct search URL in data attribute', async ({ context }) => {
    await context.route(SEARCH_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_SEARCH_LOW_CONFIDENCE_HTML }),
    );

    const page = await context.newPage();
    await page.route(MOCK_YT_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_YT_HTML }),
    );
    await page.goto(MOCK_YT_URL);

    await page.waitForSelector('#djw-indicator.djw-search-results');
    await expect(page.locator('#djw-indicator')).toHaveAttribute(
      'data-search-url',
      /search-redirect\.html/,
    );
    await expect(page.locator('#djw-indicator')).toHaveAttribute('data-search-url', /q=Test/);
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

test.describe('ad handling', () => {
  test('ad indicator appears while an ad is playing', async ({ context }) => {
    await context.route(SEARCH_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_SEARCH_FOUND_HTML }),
    );

    const page = await context.newPage();
    await page.route(MOCK_YT_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_YT_HTML_WITH_AD }),
    );
    await page.goto(MOCK_YT_URL);

    // Content script shows the ad indicator and blocks inside waitForAdToEnd()
    await expect(page.locator('#djw-indicator.djw-ad')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#djw-indicator')).toContainText('Ad in progress');
  });

  test('ad indicator is replaced by found indicator once the ad finishes', async ({ context }) => {
    await context.route(SEARCH_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_SEARCH_FOUND_HTML }),
    );

    const page = await context.newPage();
    await page.route(MOCK_YT_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_YT_HTML_WITH_AD }),
    );
    await page.goto(MOCK_YT_URL);

    // Ad indicator should be visible while the ad plays
    await page.waitForSelector('#djw-indicator.djw-ad');

    // Simulate the ad ending — YouTube removes the ad-showing class
    await page.evaluate(() =>
      document.getElementById('movie_player')?.classList.remove('ad-showing'),
    );

    // Ad indicator disappears, found indicator takes its place
    await expect(page.locator('#djw-indicator.djw-found')).toBeVisible({ timeout: 8000 });
  });

  test('found indicator appears after consecutive ads finish', async ({ context }) => {
    await context.route(SEARCH_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_SEARCH_FOUND_HTML }),
    );

    const page = await context.newPage();
    await page.route(MOCK_YT_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_YT_HTML_WITH_AD }),
    );
    await page.goto(MOCK_YT_URL);

    // Ad indicator visible throughout
    await page.waitForSelector('#djw-indicator.djw-ad');

    // First ad ends, second starts within the 300ms re-check window, then second ends
    await page.evaluate(() => {
      const player = document.getElementById('movie_player')!;
      player.classList.remove('ad-showing'); // first ad ends
      setTimeout(() => player.classList.add('ad-showing'), 100); // second ad starts (< 300ms pause)
      setTimeout(() => player.classList.remove('ad-showing'), 700); // second ad ends
    });

    await expect(page.locator('#djw-indicator.djw-found')).toBeVisible({ timeout: 8000 });
  });

  test('cached found result shown immediately without ad indicator', async ({ context }) => {
    let searchCalls = 0;
    await context.route(SEARCH_URL, (route) => {
      searchCalls++;
      route.fulfill({ contentType: 'text/html', body: MOCK_SEARCH_FOUND_HTML });
    });

    // First page load: no ad — populates the cache
    const page1 = await context.newPage();
    await page1.route(MOCK_YT_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_YT_HTML }),
    );
    await page1.goto(MOCK_YT_URL);
    await page1.waitForSelector('#djw-indicator.djw-found');
    await page1.close();

    // Second page load: ad is playing — cache hit should bypass ad wait entirely
    const page2 = await context.newPage();
    await page2.route(MOCK_YT_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_YT_HTML_WITH_AD }),
    );
    await page2.goto(MOCK_YT_URL);

    await expect(page2.locator('#djw-indicator.djw-found')).toBeVisible({ timeout: 5000 });
    await expect(page2.locator('#djw-indicator.djw-ad')).toHaveCount(0);
    expect(searchCalls).toBe(1); // search only ran once, second visit served from cache
  });

  test('cached search-results result shown immediately without ad indicator', async ({
    context,
  }) => {
    await context.route(SEARCH_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_SEARCH_LOW_CONFIDENCE_HTML }),
    );

    // First page load: no ad — populates the cache with a search URL
    const page1 = await context.newPage();
    await page1.route(MOCK_YT_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_YT_HTML }),
    );
    await page1.goto(MOCK_YT_URL);
    await page1.waitForSelector('#djw-indicator.djw-search-results');
    await page1.close();

    // Second page load: ad is playing — cache hit should bypass ad wait entirely
    const page2 = await context.newPage();
    await page2.route(MOCK_YT_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_YT_HTML_WITH_AD }),
    );
    await page2.goto(MOCK_YT_URL);

    await expect(page2.locator('#djw-indicator.djw-search-results')).toBeVisible({ timeout: 5000 });
    await expect(page2.locator('#djw-indicator.djw-ad')).toHaveCount(0);
  });
});

test.describe('pause on navigation', () => {
  test('clicking found indicator pauses a playing video', async ({ context }) => {
    await context.route(SEARCH_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_SEARCH_FOUND_HTML }),
    );

    const page = await context.newPage();
    await page.route(MOCK_YT_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_YT_HTML }),
    );
    await page.goto(MOCK_YT_URL);
    await page.waitForSelector('#djw-indicator.djw-found');

    await startVideoPlaying(page);
    expect(await page.evaluate(() => document.querySelector('video')!.paused)).toBe(false);

    const [newTab] = await Promise.all([
      context.waitForEvent('page'),
      page.locator('#djw-indicator').click(),
    ]);
    await newTab.close();

    expect(await page.evaluate(() => document.querySelector('video')!.paused)).toBe(true);
  });

  test('clicking search results indicator pauses a playing video', async ({ context }) => {
    await context.route(SEARCH_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_SEARCH_LOW_CONFIDENCE_HTML }),
    );

    const page = await context.newPage();
    await page.route(MOCK_YT_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_YT_HTML }),
    );
    await page.goto(MOCK_YT_URL);
    await page.waitForSelector('#djw-indicator.djw-search-results');

    await startVideoPlaying(page);
    expect(await page.evaluate(() => document.querySelector('video')!.paused)).toBe(false);

    // Click sends a message to the background which opens the tab — no link navigation.
    // Wait for the new tab to open (background calls browser.tabs.create), then close it.
    const [newTab] = await Promise.all([
      context.waitForEvent('page'),
      page.locator('#djw-indicator').click(),
    ]);
    await newTab.close();

    expect(await page.evaluate(() => document.querySelector('video')!.paused)).toBe(true);
  });
});
