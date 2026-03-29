import { storage } from 'wxt/utils/storage';

/** Feature toggle: auto-scroll tracklist to current track on 1001tracklists pages */
export const autoScrollEnabled = storage.defineItem<boolean>('local:autoScrollEnabled', {
  fallback: true,
});

/** Feature toggle: show 1001tracklists indicator on YouTube video pages */
export const youtubeIndicatorEnabled = storage.defineItem<boolean>(
  'local:youtubeIndicatorEnabled',
  {
    fallback: true,
  },
);

/** Feature toggle: sticky YouTube embed on 1001tracklists tracklist pages */
export const stickyYoutubeEnabled = storage.defineItem<boolean>('local:stickyYoutubeEnabled', {
  fallback: true,
});

/** Last corner the sticky player was dragged to */
export const stickyPlayerCorner = storage.defineItem<'tr' | 'tl' | 'br' | 'bl'>(
  'local:stickyPlayerCorner',
  { fallback: 'tr' },
);

/** Last size the sticky player was resized to */
export const stickyPlayerSize = storage.defineItem<{ width: number; height: number }>(
  'local:stickyPlayerSize',
  { fallback: { width: 320, height: 180 } },
);

/**
 * Cache of YouTube video ID → matched tracklist URL (or null if searched and not found).
 * undefined/missing key = not yet searched.
 * null = searched, no result found.
 */
export const searchCache = storage.defineItem<Record<string, string | null>>('local:searchCache', {
  fallback: {},
});

const CACHE_MAX_ENTRIES = 200;

export async function getCachedResult(videoId: string): Promise<string | null | undefined> {
  const cache = await searchCache.getValue();
  return cache[videoId];
}

export async function setCachedResult(videoId: string, url: string | null): Promise<void> {
  const cache = await searchCache.getValue();
  const keys = Object.keys(cache);
  if (keys.length >= CACHE_MAX_ENTRIES) {
    // FIFO eviction: remove oldest entries
    const toRemove = keys.slice(0, keys.length - CACHE_MAX_ENTRIES + 1);
    for (const k of toRemove) delete cache[k];
  }
  cache[videoId] = url;
  await searchCache.setValue(cache);
}

export async function clearSearchCache(): Promise<void> {
  await searchCache.setValue({});
}
