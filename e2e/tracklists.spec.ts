/**
 * E2E tests for the 1001tracklists content script.
 *
 * NOTE: These tests require a production build and Playwright Chromium installed.
 * Run with: pnpm test:e2e
 */
import { test, expect } from './fixtures';

// URL that matches the content script's pattern — actual HTML is intercepted below
const TRACKLIST_URL =
  'https://www.1001tracklists.com/tracklist/21ssvh4t/boys-noize-vtss-arc-2025.html';

const TRACK_ROWS = Array.from(
  { length: 40 },
  (_, i) =>
    `<div id="tlp_${i}" class="tlpTog bItm tlpItem trRow${i}" style="height:60px;margin:2px;">Track ${i + 1}</div>`,
).join('\n');

// Minimal mock of a 1001tracklists tracklist page.
// 40 tall rows so the last one is well off-screen in a standard viewport.
const MOCK_HTML = `<!doctype html>
<html><head><title>Test Tracklist</title></head>
<body>
  <div id="tlp">
    ${TRACK_ROWS}
  </div>
</body></html>`;

// Same mock but with a YouTube embed above the tracklist.
const MOCK_HTML_WITH_YOUTUBE = `<!doctype html>
<html><head><title>Test Tracklist</title></head>
<body>
  <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ?enablejsapi=1"
    width="640" height="360" style="display:block;margin-bottom:8px;"></iframe>
  <div id="tlp">
    ${TRACK_ROWS}
  </div>
</body></html>`;

test.describe('auto-scroll', () => {
  test('scrolls to track when .cPlay is set', async ({ context }) => {
    const page = await context.newPage();

    // Serve mock HTML so the test is independent of the live site
    await page.route(TRACKLIST_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_HTML }),
    );

    await page.goto(TRACKLIST_URL);
    await page.waitForSelector('.bItm');

    // Scroll to top so the last track is out of view
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const target = page.locator('.bItm').last();
    await expect(target).not.toBeInViewport();

    // Simulate the site marking a track as current
    await page.evaluate(() => {
      document.querySelector('.bItm:last-of-type')?.classList.add('cPlay');
    });

    // Allow time for the smooth scroll to finish
    await page.waitForTimeout(1500);
    await expect(target).toBeInViewport();
  });

  test('does not scroll while user is scrolling', async ({ context }) => {
    const page = await context.newPage();

    await page.route(TRACKLIST_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_HTML }),
    );

    await page.goto(TRACKLIST_URL);
    await page.waitForSelector('.bItm');

    // Simulate a wheel event to set the 3-second scroll-guard flag
    await page.evaluate(() =>
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true })),
    );

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const target = page.locator('.bItm').last();
    await expect(target).not.toBeInViewport();

    // Mark a track as current — should NOT trigger scroll while guard is active
    await page.evaluate(() => {
      document.querySelector('.bItm:last-of-type')?.classList.add('cPlay');
    });

    await page.waitForTimeout(500);
    await expect(target).not.toBeInViewport();
  });
});

test.describe('sticky youtube player', () => {
  test('overlay appears after scrolling past the iframe', async ({ context }) => {
    const page = await context.newPage();

    await page.route(TRACKLIST_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_HTML_WITH_YOUTUBE }),
    );

    await page.goto(TRACKLIST_URL);
    await page.waitForSelector('iframe[src*="youtube"][src*="/embed/"]');

    await page.evaluate(() => window.scrollTo({ top: 9999, behavior: 'instant' }));
    await page.waitForTimeout(500);

    await expect(page.locator('iframe.djw-sticky-iframe')).toBeVisible();
    await expect(page.locator('#djw-sticky-controls')).toBeAttached();
    await expect(page.locator('#djw-sticky-drag-bar')).toBeAttached();
    await expect(page.locator('.djw-resize-handle')).toBeAttached();
  });

  test('sticky class is removed when scrolling back up', async ({ context }) => {
    const page = await context.newPage();

    await page.route(TRACKLIST_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_HTML_WITH_YOUTUBE }),
    );

    await page.goto(TRACKLIST_URL);
    await page.waitForSelector('iframe[src*="youtube"][src*="/embed/"]');

    await page.evaluate(() => window.scrollTo({ top: 9999, behavior: 'instant' }));
    await page.waitForSelector('#djw-sticky-placeholder');

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(500);

    await expect(page.locator('iframe.djw-sticky-iframe')).toHaveCount(0);
  });

  test('teardown when toggled off while active', async ({ context, extensionId }) => {
    const page = await context.newPage();

    await page.route(TRACKLIST_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_HTML_WITH_YOUTUBE }),
    );

    await page.goto(TRACKLIST_URL);
    await page.waitForSelector('iframe[src*="youtube"][src*="/embed/"]');

    // Activate sticky
    await page.evaluate(() => window.scrollTo({ top: 9999, behavior: 'instant' }));
    await page.waitForSelector('iframe.djw-sticky-iframe');

    // Disable the feature via the options page while the sticky is live
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    const input = optionsPage.locator('#sticky-youtube');
    if (await input.isChecked()) {
      await optionsPage.locator('label:has(#sticky-youtube) .toggle-track').click();
    }
    await optionsPage.close();

    // Storage change propagates to the content script via watch()
    await page.waitForTimeout(500);
    await expect(page.locator('iframe.djw-sticky-iframe')).toHaveCount(0);
    await expect(page.locator('#djw-sticky-controls')).toHaveCount(0);

    // Restore
    const restorePage = await context.newPage();
    await restorePage.goto(`chrome-extension://${extensionId}/options.html`);
    if (!(await restorePage.locator('#sticky-youtube').isChecked())) {
      await restorePage.locator('label:has(#sticky-youtube) .toggle-track').click();
    }
    await restorePage.close();
  });

  test('sticky does not activate when feature is disabled', async ({ context, extensionId }) => {
    // Disable the toggle via the options page first
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    const toggle = optionsPage.locator('label:has(#sticky-youtube) .toggle-track');
    const input = optionsPage.locator('#sticky-youtube');
    if (await input.isChecked()) await toggle.click();
    await optionsPage.close();

    const page = await context.newPage();
    await page.route(TRACKLIST_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: MOCK_HTML_WITH_YOUTUBE }),
    );

    await page.goto(TRACKLIST_URL);
    await page.waitForSelector('iframe[src*="youtube"][src*="/embed/"]');

    await page.evaluate(() => window.scrollTo({ top: 9999, behavior: 'instant' }));
    await page.waitForTimeout(500);

    await expect(page.locator('iframe.djw-sticky-iframe')).toHaveCount(0);

    // Restore the toggle
    const restorePage = await context.newPage();
    await restorePage.goto(`chrome-extension://${extensionId}/options.html`);
    const restoreInput = restorePage.locator('#sticky-youtube');
    if (!(await restoreInput.isChecked())) {
      await restorePage.locator('label:has(#sticky-youtube) .toggle-track').click();
    }
    await restorePage.close();
  });
});

test.describe('options', () => {
  test('options page loads and has all toggles', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    // The inputs are visually hidden (custom toggle UI) — check the visible labels
    await expect(page.locator('label[for="auto-scroll"]')).toBeVisible();
    await expect(page.locator('label[for="youtube-indicator"]')).toBeVisible();
    await expect(page.locator('label[for="sticky-youtube"]')).toBeVisible();
    await expect(page.locator('#clear-cache')).toBeVisible();
  });

  test('toggles persist after page reload', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    const input = page.locator('#auto-scroll');
    const initial = await input.isChecked();

    // Click the visible toggle track, not the hidden input
    await page.locator('label:has(#auto-scroll) .toggle-track').click();
    await page.reload();

    await expect(input).toBeChecked({ checked: !initial });

    // Restore original state
    await page.locator('label:has(#auto-scroll) .toggle-track').click();
  });
});
