import { describe, it, expect } from 'vitest';
import {
  parseTracklistResults,
  tokenize,
  selectBestTracklist,
  CONFIDENCE_THRESHOLD,
} from '../entrypoints/background';

/** Minimal HTML simulating a 1001tracklists search results page */
function makeSearchHtml(links: Array<{ href: string; text: string }>): string {
  const items = links
    .map((l) => `<div class="resultItem"><a href="${l.href}">${l.text}</a></div>`)
    .join('\n');
  return `<html><body><div id="searchResults">${items}</div></body></html>`;
}

describe('parseTracklistResults', () => {
  it('returns [] for HTML with no tracklist links', () => {
    expect(parseTracklistResults('<html><body></body></html>')).toEqual([]);
  });

  it('returns [] when only non-tracklist links are present', () => {
    const html = makeSearchHtml([{ href: '/dj/artist', text: 'Some DJ' }]);
    expect(parseTracklistResults(html)).toEqual([]);
  });

  it('parses a single relative result into url and title', () => {
    const html = makeSearchHtml([
      { href: '/tracklist/19lbyg9k/set-title.html', text: 'Set Title' },
    ]);
    expect(parseTracklistResults(html)).toEqual([
      {
        url: 'https://www.1001tracklists.com/tracklist/19lbyg9k/set-title.html',
        title: 'Set Title',
      },
    ]);
  });

  it('handles absolute hrefs unchanged', () => {
    const html = makeSearchHtml([
      { href: 'https://www.1001tracklists.com/tracklist/abc/set.html', text: 'Set' },
    ]);
    expect(parseTracklistResults(html)).toEqual([
      { url: 'https://www.1001tracklists.com/tracklist/abc/set.html', title: 'Set' },
    ]);
  });

  it('returns multiple results in document order', () => {
    const html = makeSearchHtml([
      { href: '/tracklist/aaa/first.html', text: 'First' },
      { href: '/tracklist/bbb/second.html', text: 'Second' },
    ]);
    const results = parseTracklistResults(html);
    expect(results).toHaveLength(2);
    expect(results[0].url).toContain('aaa');
    expect(results[1].url).toContain('bbb');
  });

  it('deduplicates identical hrefs', () => {
    const html = makeSearchHtml([
      { href: '/tracklist/dup/set.html', text: 'First' },
      { href: '/tracklist/dup/set.html', text: 'Duplicate' },
    ]);
    expect(parseTracklistResults(html)).toHaveLength(1);
  });

  it('strips inner HTML tags from the title', () => {
    const html = `<a href="/tracklist/x/y.html"><span class="title">Artist @ Festival</span></a>`;
    const results = parseTracklistResults(html);
    expect(results[0].title).toBe('Artist @ Festival');
  });

  it('ignores non-tracklist paths that share a prefix', () => {
    const html = makeSearchHtml([
      { href: '/tracklists-overview', text: 'Overview' },
      { href: '/tracklist/real/set.html', text: 'Real Set' },
    ]);
    const results = parseTracklistResults(html);
    expect(results).toHaveLength(1);
    expect(results[0].url).toContain('/tracklist/real/');
  });
});

describe('tokenize', () => {
  it('lowercases input', () => {
    expect(tokenize('Artist')).toContain('artist');
  });

  it('splits on spaces, hyphens, and @ separators', () => {
    const tokens = tokenize('Boys Noize b2b VTSS @ ARC Festival');
    expect(tokens).toContain('boys');
    expect(tokens).toContain('noize');
    expect(tokens).toContain('vtss');
    expect(tokens).toContain('arc');
    expect(tokens).toContain('festival');
  });

  it('filters tokens shorter than 2 characters', () => {
    const tokens = tokenize('a b c DJ set 2024');
    expect(tokens).not.toContain('b');
    expect(tokens).not.toContain('c');
    expect(tokens).toContain('dj');
    expect(tokens).toContain('set');
    expect(tokens).toContain('2024');
  });

  it('removes stopwords — articles, prepositions, conjunctions', () => {
    const tokens = tokenize('live at the festival in amsterdam');
    expect(tokens).not.toContain('live');
    expect(tokens).not.toContain('at');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('in');
    expect(tokens).toContain('festival');
    expect(tokens).toContain('amsterdam');
  });

  it('removes stopwords — auxiliary verbs and pronouns', () => {
    const tokens = tokenize('is are was you they all need with for');
    expect(tokens).not.toContain('is');
    expect(tokens).not.toContain('are');
    expect(tokens).not.toContain('was');
    expect(tokens).not.toContain('you');
    expect(tokens).not.toContain('they');
    expect(tokens).not.toContain('all');
    expect(tokens).not.toContain('need');
    expect(tokens).not.toContain('with');
    expect(tokens).not.toContain('for');
    expect(tokens).toEqual(new Set());
  });

  it('returns empty set for punctuation-only input', () => {
    expect(tokenize('--- @ | ---')).toEqual(new Set());
  });

  it('returns empty set for empty string', () => {
    expect(tokenize('')).toEqual(new Set());
  });
});

describe('selectBestTracklist', () => {
  it('returns null for empty candidates', () => {
    expect(selectBestTracklist([], 'Boys Noize @ ARC Festival 2025')).toBeNull();
  });

  it('returns null when query tokenizes to fewer than 2 tokens', () => {
    const candidates = [{ url: 'https://www.1001tracklists.com/tracklist/x/y.html', title: 'Y' }];
    expect(selectBestTracklist(candidates, 'X')).toBeNull();
  });

  it('returns null when best score is below CONFIDENCE_THRESHOLD', () => {
    const candidates = [
      {
        url: 'https://www.1001tracklists.com/tracklist/z/unrelated-artist-other-event-2020.html',
        title: 'Unrelated Artist @ Other Event 2020',
      },
    ];
    // Query has completely different tokens
    expect(selectBestTracklist(candidates, 'Boys Noize @ ARC Festival 2025')).toBeNull();
  });

  it('returns the matching URL when score meets threshold', () => {
    const candidates = [
      {
        url: 'https://www.1001tracklists.com/tracklist/abc/boys-noize-arc-festival-2025.html',
        title: 'Boys Noize @ ARC Festival 2025',
      },
    ];
    const result = selectBestTracklist(candidates, 'Boys Noize @ ARC Festival 2025');
    expect(result).toBe(
      'https://www.1001tracklists.com/tracklist/abc/boys-noize-arc-festival-2025.html',
    );
  });

  it('picks the highest-scoring candidate when multiple are present', () => {
    const candidates = [
      {
        url: 'https://www.1001tracklists.com/tracklist/bad/unrelated-dj-2020.html',
        title: 'Unrelated DJ 2020',
      },
      {
        url: 'https://www.1001tracklists.com/tracklist/good/boys-noize-arc-festival-2025.html',
        title: 'Boys Noize @ ARC Festival 2025',
      },
    ];
    const result = selectBestTracklist(candidates, 'Boys Noize @ ARC Festival 2025');
    expect(result).toContain('/good/');
  });

  it('returns null even for partial matches when score is below threshold', () => {
    // Only year matches — not enough tokens
    const candidates = [
      {
        url: 'https://www.1001tracklists.com/tracklist/x/some-dj-club-2025.html',
        title: 'Some DJ @ Club 2025',
      },
    ];
    // Query has many tokens, only "2025" overlaps
    expect(selectBestTracklist(candidates, 'Charlotte de Witte ADE Amsterdam 2025')).toBeNull();
  });

  it('uses slug tokens as supplementary signal when title is missing', () => {
    const candidates = [
      {
        url: 'https://www.1001tracklists.com/tracklist/abc/boys-noize-arc-festival-2025.html',
        title: '', // no display title
      },
    ];
    const result = selectBestTracklist(candidates, 'Boys Noize ARC Festival 2025');
    expect(result).not.toBeNull();
  });

  it('does not match non-DJ content that overlaps only on common English phrases', () => {
    // Regression: "Claude Code is overkill - Pi is All you Need" was matching
    // "Delius & Radianze … All You Need Is Rough" because is/all/you/need were not stopwords.
    const candidates = [
      {
        url: 'https://www.1001tracklists.com/tracklist/16jbg91k/delius-radianze-roughstate-presents-all-you-need-is-rough-xmas-special-netherlands-2021-12-23.html',
        title:
          'Delius & Radianze @ Roughstate presents All You Need Is Rough (Xmas Special), Netherlands 2021-12-23',
      },
    ];
    expect(
      selectBestTracklist(candidates, 'Claude Code is overkill - Pi is All you Need'),
    ).toBeNull();
  });

  it(`CONFIDENCE_THRESHOLD is ${CONFIDENCE_THRESHOLD}`, () => {
    // Exported so callers can reason about the threshold
    expect(CONFIDENCE_THRESHOLD).toBeGreaterThan(0);
    expect(CONFIDENCE_THRESHOLD).toBeLessThan(1);
  });
});
