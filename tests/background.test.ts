import { describe, it, expect } from 'vitest';
import { parseFirstTracklist } from '../entrypoints/background';

/** Minimal HTML simulating a 1001tracklists search results page */
function makeSearchHtml(links: Array<{ href: string; text: string }>): string {
  const items = links
    .map((l) => `<div class="resultItem"><a href="${l.href}">${l.text}</a></div>`)
    .join('\n');
  return `<html><body><div id="searchResults">${items}</div></body></html>`;
}

describe('parseFirstTracklist', () => {
  it('returns null for empty HTML', () => {
    expect(parseFirstTracklist('<html><body></body></html>')).toBeNull();
  });

  it('returns null when no tracklist links are present', () => {
    const html = makeSearchHtml([{ href: '/dj/artist', text: 'Some DJ' }]);
    expect(parseFirstTracklist(html)).toBeNull();
  });

  it('returns the first tracklist URL', () => {
    const html = makeSearchHtml([
      { href: '/tracklist/19lbyg9k/set-title.html', text: 'Set Title' },
      { href: '/tracklist/other/another.html', text: 'Another' },
    ]);
    expect(parseFirstTracklist(html)).toBe(
      'https://www.1001tracklists.com/tracklist/19lbyg9k/set-title.html',
    );
  });

  it('returns an absolute URL unchanged', () => {
    const html = makeSearchHtml([
      { href: 'https://www.1001tracklists.com/tracklist/abc/set.html', text: 'Set' },
    ]);
    expect(parseFirstTracklist(html)).toBe('https://www.1001tracklists.com/tracklist/abc/set.html');
  });

  it('ignores non-tracklist links that happen to share a prefix', () => {
    const html = makeSearchHtml([
      { href: '/tracklists-overview', text: 'Overview' },
      { href: '/tracklist/real/set.html', text: 'Real Set' },
    ]);
    expect(parseFirstTracklist(html)).toBe(
      'https://www.1001tracklists.com/tracklist/real/set.html',
    );
  });
});
