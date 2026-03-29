import { onMessage } from '../utils/messaging';

export default defineBackground(() => {
  onMessage('searchTracklist', async ({ data }) => {
    if (data.query.trim().length < 5) return null;

    try {
      const res = await fetch('https://www.1001tracklists.com/search/result.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'https://www.1001tracklists.com',
          Referer: 'https://www.1001tracklists.com/',
        },
        body: `main_search=${encodeURIComponent(data.query)}&search_selection=9`,
      });
      if (!res.ok) return null;
      const html = await res.text();
      const result = parseFirstTracklist(html);
      console.log(
        '[djset-webtools] query:',
        data.query,
        '| status:',
        res.status,
        '| bytes:',
        html.length,
        '| result:',
        result,
      );
      return result;
    } catch {
      return null;
    }
  });
});

/**
 * Parse the 1001tracklists search results HTML and return the URL of the first
 * tracklist result, or null if none found.
 *
 * The POST search endpoint returns server-rendered HTML with real links —
 * unlike the GET page which is a JS-rendered SPA shell.
 */
export function parseFirstTracklist(html: string): string | null {
  // DOMParser is not available in MV3 service workers — use regex instead.
  // Match the first href pointing to a /tracklist/ path.
  const match = html.match(/href="((?:https:\/\/www\.1001tracklists\.com)?\/tracklist\/[^"]+)"/);
  if (!match) return null;

  const href = match[1];
  if (href.startsWith('http')) return href;
  return `https://www.1001tracklists.com${href}`;
}
