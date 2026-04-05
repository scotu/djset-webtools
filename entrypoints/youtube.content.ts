import { sendMessage } from '../utils/messaging';
import {
  youtubeIndicatorEnabled,
  getCachedResult,
  setCachedResult,
  deleteCachedResult,
} from '../utils/storage';
import { normaliseTitle } from '../utils/string';
import { injectStyle, removeElement } from '../utils/dom';
import { log } from '../utils/log';

const INDICATOR_ID = 'djw-indicator';
const STYLE_ID = 'djw-youtube-style';
const MIN_DURATION_SECONDS = 30 * 60;

const SEARCH_BASE = 'https://www.1001tracklists.com/search/index.php';

export default defineContentScript({
  matches: ['*://www.youtube.com/watch*'],
  runAt: 'document_idle',

  async main(ctx) {
    await handleNavigation();
    ctx.addEventListener(window, 'yt-navigate-finish', handleNavigation);
  },
});

async function handleNavigation(): Promise<void> {
  removeElement(`#${INDICATOR_ID}`);
  log('handleNavigation', location.href);

  const enabled = await youtubeIndicatorEnabled.getValue();
  if (!enabled) {
    log('disabled');
    return;
  }

  const videoId = new URLSearchParams(location.search).get('v');
  if (!videoId) {
    log('no videoId');
    return;
  }

  // Fast path: serve cached result immediately — skip ad wait and duration check.
  const cached = await getCachedResult(videoId);
  log('cached:', cached);

  if (typeof cached === 'string') {
    injectFoundIndicator(cached);
    return;
  }

  if (cached === null) {
    const title = getVideoTitle();
    const query = title ? normaliseTitle(title) : '';
    if (query.length >= 5) injectNotFoundIndicator(query, videoId);
    return;
  }

  // Not yet searched — full flow: ad wait, duration check, then search.
  if (isAdPlaying()) {
    injectAdIndicator();
    await waitForAdToEnd();
    removeElement(`#${INDICATOR_ID}`);
  }

  const duration = await waitForVideoDuration();
  log('duration:', duration, 'min required:', MIN_DURATION_SECONDS);
  if (duration === null || duration < MIN_DURATION_SECONDS) return;

  const title = getVideoTitle();
  log('title:', title);
  if (!title) return;
  const query = normaliseTitle(title);
  log('query:', query);
  if (query.length < 5) return;

  await searchAndDisplay(query, videoId);
}

async function searchAndDisplay(query: string, videoId: string): Promise<void> {
  injectSearchingIndicator();
  const url = await sendMessage('searchTracklist', { query });
  log('result: videoId=%s query=%s url=%s', videoId, query, url);
  await setCachedResult(videoId, url);
  removeElement(`#${INDICATOR_ID}`);
  if (url) {
    injectFoundIndicator(url);
  } else {
    injectNotFoundIndicator(query, videoId);
  }
}

// ---------------------------------------------------------------------------
// Duration helpers
// ---------------------------------------------------------------------------

function getVideoDuration(): number | null {
  try {
    const raw = (window as any).ytInitialPlayerResponse?.videoDetails?.lengthSeconds;
    if (raw != null) {
      const seconds = parseInt(String(raw), 10);
      if (!isNaN(seconds)) return seconds;
    }
  } catch {
    // fall through
  }
  const videoEl = document.querySelector<HTMLVideoElement>('video');
  if (videoEl) {
    // data-duration is a test-only hook; never present on real YouTube pages
    const testDuration = videoEl.dataset.duration ? parseInt(videoEl.dataset.duration, 10) : NaN;
    if (!isNaN(testDuration) && testDuration > 0) return testDuration;
    if (isFinite(videoEl.duration) && videoEl.duration > 0) return Math.round(videoEl.duration);
  }
  return null;
}

async function waitForVideoDuration(maxWaitMs = 3000): Promise<number | null> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const d = getVideoDuration();
    if (d !== null) return d;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

function isAdPlaying(): boolean {
  return (
    document.getElementById('movie_player')?.classList.contains('ad-showing') === true ||
    !!document.querySelector('.ytp-ad-player-overlay')
  );
}

/**
 * Waits until no ad is playing, handling consecutive ad sequences.
 * Uses a MutationObserver on #movie_player's class attribute so there is no busy-polling.
 */
async function waitForAdToEnd(maxWaitMs = 5 * 60 * 1000): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const player = document.getElementById('movie_player');
    if (!player?.classList.contains('ad-showing')) break;

    log('ad playing, waiting for it to end...');
    await new Promise<void>((resolve) => {
      const remaining = deadline - Date.now();
      const timer = setTimeout(resolve, remaining);
      const obs = new MutationObserver(() => {
        if (!player.classList.contains('ad-showing')) {
          obs.disconnect();
          clearTimeout(timer);
          resolve();
        }
      });
      obs.observe(player, { attributes: true, attributeFilter: ['class'] });
    });
    // Brief pause so YouTube can add the next ad's class if ads are back-to-back
    await new Promise((r) => setTimeout(r, 300));
  }
}

function getVideoTitle(): string | null {
  try {
    const fromData = (window as any).ytInitialPlayerResponse?.videoDetails?.title;
    if (fromData) return String(fromData);
  } catch {
    // fall through to DOM
  }
  return (
    document
      .querySelector<HTMLElement>('h1.ytd-watch-metadata yt-formatted-string')
      ?.textContent?.trim() ?? null
  );
}

// ---------------------------------------------------------------------------
// Indicator rendering
// ---------------------------------------------------------------------------

function ensureStyle(): void {
  injectStyle(
    STYLE_ID,
    `
    #${INDICATOR_ID} {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 6px;
      padding: 4px 10px;
      border-radius: 4px;
      background: #1a1a2e;
      color: #e0e0e0;
      font-size: 13px;
      font-family: sans-serif;
      line-height: 1.4;
      text-decoration: none;
    }
    #${INDICATOR_ID} img {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }
    #${INDICATOR_ID}.djw-found:hover {
      background: #16213e;
      color: #fff;
    }
    #${INDICATOR_ID}.djw-searching,
    #${INDICATOR_ID}.djw-ad {
      opacity: 0.6;
    }
    #${INDICATOR_ID}.djw-not-found {
      gap: 8px;
    }
    .djw-action {
      background: rgba(255,255,255,0.1);
      border: none;
      color: #bbb;
      font-size: 12px;
      padding: 2px 7px;
      border-radius: 3px;
      cursor: pointer;
      text-decoration: none;
      font-family: sans-serif;
      line-height: 1.4;
    }
    .djw-action:hover {
      background: rgba(255,255,255,0.2);
      color: #fff;
    }
  `,
  );
}

function makeIcon(): HTMLImageElement {
  const img = document.createElement('img');
  img.src = browser.runtime.getURL('/icon/16-light.png');
  img.alt = '';
  return img;
}

function insertBelowTitle(el: HTMLElement): void {
  const titleEl = document.querySelector('h1.ytd-watch-metadata');
  if (titleEl?.parentElement) {
    titleEl.parentElement.insertBefore(el, titleEl.nextSibling);
  }
}

function injectAdIndicator(): void {
  ensureStyle();
  const el = document.createElement('div');
  el.id = INDICATOR_ID;
  el.className = 'djw-ad';
  el.appendChild(makeIcon());
  el.appendChild(document.createTextNode('Ad in progress…'));
  insertBelowTitle(el);
}

function injectSearchingIndicator(): void {
  ensureStyle();
  const el = document.createElement('div');
  el.id = INDICATOR_ID;
  el.className = 'djw-searching';
  el.appendChild(makeIcon());
  el.appendChild(document.createTextNode('Searching 1001tracklists…'));
  insertBelowTitle(el);
}

function injectFoundIndicator(tracklistUrl: string): void {
  ensureStyle();
  const anchor = document.createElement('a');
  anchor.id = INDICATOR_ID;
  anchor.className = 'djw-found';
  anchor.href = tracklistUrl;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.appendChild(makeIcon());
  anchor.appendChild(document.createTextNode('Tracklist found on 1001tracklists'));
  insertBelowTitle(anchor);
}

function injectNotFoundIndicator(query: string, videoId: string): void {
  ensureStyle();

  const el = document.createElement('div');
  el.id = INDICATOR_ID;
  el.className = 'djw-not-found';
  el.appendChild(makeIcon());
  el.appendChild(document.createTextNode('No tracklist found'));

  const retryBtn = document.createElement('button');
  retryBtn.className = 'djw-action';
  retryBtn.textContent = '↺ Retry';
  retryBtn.addEventListener('click', async () => {
    removeElement(`#${INDICATOR_ID}`);
    await deleteCachedResult(videoId);
    await searchAndDisplay(query, videoId);
  });
  el.appendChild(retryBtn);

  const searchUrl = `${SEARCH_BASE}?main_search=${encodeURIComponent(query)}&search_selection=9`;
  const searchLink = document.createElement('a');
  searchLink.className = 'djw-action';
  searchLink.href = searchUrl;
  searchLink.target = '_blank';
  searchLink.rel = 'noopener noreferrer';
  searchLink.textContent = '🔍 Search';
  el.appendChild(searchLink);

  insertBelowTitle(el);
}
