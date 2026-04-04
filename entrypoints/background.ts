import { onMessage } from '../utils/messaging';
import { log } from '../utils/log';

const ICONS = {
  dark: {
    16: '/icon/16-dark.png',
    32: '/icon/32-dark.png',
    48: '/icon/48-dark.png',
    128: '/icon/128-dark.png',
  },
  light: {
    16: '/icon/16-light.png',
    32: '/icon/32-light.png',
    48: '/icon/48-light.png',
    128: '/icon/128-light.png',
  },
};

export default defineBackground(() => {
  // browser.action is MV3 only; Firefox MV2 exposes browser.browserAction.
  const actionApi = browser.action ?? (browser as any).browserAction;

  // Chrome MV3: service workers have no matchMedia, use the action API instead.
  // colorScheme === 'light' is the only explicitly light state; 'normal' follows
  // the system theme and Chrome reports it even when the toolbar is visually dark.
  const chromeAction = (globalThis as any).chrome?.action;
  if (chromeAction?.getUserSettings) {
    const update = async () => {
      const { colorScheme } = await chromeAction.getUserSettings();
      actionApi.setIcon({ path: colorScheme === 'light' ? ICONS.dark : ICONS.light });
    };
    update();
    chromeAction.onUserSettingsChanged?.addListener(update);
  }
  // Firefox MV2: background pages have matchMedia.
  else if (typeof matchMedia !== 'undefined') {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const update = (dark: boolean) => actionApi.setIcon({ path: dark ? ICONS.light : ICONS.dark });
    update(mq.matches);
    mq.addEventListener('change', (e) => update(e.matches));
  }

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
      log(
        'query:',
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
