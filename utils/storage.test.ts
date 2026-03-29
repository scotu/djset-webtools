import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getCachedResult, setCachedResult, clearSearchCache, searchCache } from './storage';

describe('search cache', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('returns undefined for an unseen video ID', async () => {
    const result = await getCachedResult('abc123');
    expect(result).toBeUndefined();
  });

  it('returns null after a no-result search is cached', async () => {
    await setCachedResult('abc123', null);
    expect(await getCachedResult('abc123')).toBeNull();
  });

  it('returns the URL after a successful match is cached', async () => {
    const url = 'https://www.1001tracklists.com/tracklist/1abc/set.html';
    await setCachedResult('abc123', url);
    expect(await getCachedResult('abc123')).toBe(url);
  });

  it('clears the cache', async () => {
    await setCachedResult('abc123', 'https://example.com');
    await clearSearchCache();
    expect(await getCachedResult('abc123')).toBeUndefined();
  });

  it('evicts oldest entries when cache exceeds 200 entries', async () => {
    // Fill cache with 200 entries
    for (let i = 0; i < 200; i++) {
      await setCachedResult(`video${i}`, `https://example.com/${i}`);
    }

    // Adding one more should evict video0
    await setCachedResult('video200', 'https://example.com/200');

    const cache = await searchCache.getValue();
    expect(Object.keys(cache)).toHaveLength(200);
    expect(cache['video0']).toBeUndefined();
    expect(cache['video200']).toBe('https://example.com/200');
  });
});
