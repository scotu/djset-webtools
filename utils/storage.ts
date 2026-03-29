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
