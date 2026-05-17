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

export const CONFIDENCE_THRESHOLD = 0.5;

const STOPWORDS = new Set([
  // Articles
  'the',
  'a',
  'an',
  // Prepositions
  'at',
  'in',
  'of',
  'from',
  'by',
  'to',
  'on',
  'with',
  'for',
  'into',
  'up',
  'out',
  'about',
  'as',
  // Conjunctions
  'and',
  'or',
  'but',
  'so',
  // Auxiliary & common verbs
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'has',
  'have',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'can',
  // Pronouns
  'you',
  'he',
  'she',
  'it',
  'we',
  'they',
  'me',
  'him',
  'her',
  'us',
  'them',
  'my',
  'your',
  'his',
  'its',
  'our',
  'their',
  // Common function/qualifier words
  'all',
  'not',
  'no',
  'if',
  'this',
  'that',
  'which',
  'what',
  'need',
  // DJ-context noise
  'live',
]);

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

  onMessage('openSearchTab', ({ data }) => {
    browser.tabs.create({ url: data.url });
  });

  onMessage('searchTracklist', async ({ data }) => {
    if (data.query.trim().length < 5) return null;

    const searchPageUrl = `${browser.runtime.getURL('/search-redirect.html')}?q=${encodeURIComponent(data.query)}`;

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
      const candidates = parseTracklistResults(html);
      const bestUrl = selectBestTracklist(candidates, data.query);
      log(
        'query:',
        data.query,
        '| candidates:',
        candidates.length,
        '| best:',
        bestUrl ?? '(none — falling back to search page)',
      );
      return bestUrl ?? searchPageUrl;
    } catch {
      return null;
    }
  });
});

/**
 * Parse the 1001tracklists search results HTML and return all tracklist
 * candidates as { url, title } pairs.
 *
 * The POST search endpoint returns server-rendered HTML with real links —
 * unlike the GET page which is a JS-rendered SPA shell.
 * DOMParser is not available in MV3 service workers — use regex instead.
 */
export function parseTracklistResults(html: string): Array<{ url: string; title: string }> {
  const results: Array<{ url: string; title: string }> = [];
  const seen = new Set<string>();
  // Capture href and anchor inner content (lazy, dotAll for multiline titles)
  const re =
    /href="((?:https?:\/\/www\.1001tracklists\.com)?\/tracklist\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const href = match[1];
    const url = href.startsWith('http') ? href : `https://www.1001tracklists.com${href}`;
    if (seen.has(url)) continue;
    seen.add(url);
    // Strip inner HTML tags to get plain text title
    const title = match[2].replace(/<[^>]+>/g, '').trim();
    results.push({ url, title });
  }
  return results;
}

/**
 * Tokenise a string into a set of lowercase, meaningful tokens.
 * Used for scoring tracklist result candidates against the YouTube title.
 */
export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[\s\-@/.,|()+#]+/)
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t)),
  );
}

/**
 * Score a tracklist candidate against the normalised YouTube query.
 * Returns the fraction of query tokens found in the candidate (title + slug).
 */
function scoreCandidate(
  candidate: { url: string; title: string },
  queryTokens: Set<string>,
): number {
  if (queryTokens.size === 0) return 0;
  // Extract the slug from the URL path (e.g. "boys-noize-arc-festival-2025" from the last segment)
  const slug = candidate.url.match(/\/tracklist\/[^/]+\/([^/]+?)(?:\.html)?(?:\?.*)?$/)?.[1] ?? '';
  const candidateText = `${candidate.title} ${slug.replace(/-/g, ' ')}`;
  const candidateTokens = tokenize(candidateText);
  let matches = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) matches++;
  }
  return matches / queryTokens.size;
}

/**
 * Return the URL of the best-matching tracklist candidate, or null if no
 * candidate clears the confidence threshold.
 */
export function selectBestTracklist(
  candidates: Array<{ url: string; title: string }>,
  query: string,
): string | null {
  const queryTokens = tokenize(query);
  if (queryTokens.size < 2) return null;

  let bestUrl: string | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = scoreCandidate(candidate, queryTokens);
    if (score > bestScore) {
      bestScore = score;
      bestUrl = candidate.url;
    }
  }

  // Require at least 2 token matches (not just a high fraction of a tiny token set)
  // and that the score clears the threshold.
  if (bestUrl === null) return null;
  const queryArr = [...queryTokens];
  const candidateForBest = candidates.find((c) => c.url === bestUrl)!;
  const slug =
    candidateForBest.url.match(/\/tracklist\/[^/]+\/([^/]+?)(?:\.html)?(?:\?.*)?$/)?.[1] ?? '';
  const candidateText = `${candidateForBest.title} ${slug.replace(/-/g, ' ')}`;
  const candidateTokens = tokenize(candidateText);
  const matchCount = queryArr.filter((t) => candidateTokens.has(t)).length;

  if (matchCount < 2 || bestScore < CONFIDENCE_THRESHOLD) return null;
  return bestUrl;
}
