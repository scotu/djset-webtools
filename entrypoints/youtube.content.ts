import { sendMessage } from '../utils/messaging';
import { youtubeIndicatorEnabled, getCachedResult, setCachedResult } from '../utils/storage';
import { normaliseTitle } from '../utils/string';
import { injectStyle, removeElement } from '../utils/dom';
import { log } from '../utils/log';

const INDICATOR_ID = 'djw-indicator';
const STYLE_ID = 'djw-youtube-style';
const MIN_DURATION_SECONDS = 30 * 60;

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

  const duration = await waitForVideoDuration();
  log('duration:', duration, 'min required:', MIN_DURATION_SECONDS);
  if (duration === null || duration < MIN_DURATION_SECONDS) return;

  const cached = await getCachedResult(videoId);
  log('cached:', cached);
  if (cached === null) return; // searched before, no result

  if (typeof cached === 'string') {
    injectIndicator(cached);
    return;
  }

  // Not yet searched — fetch from background
  const title = getVideoTitle();
  log('title:', title);
  if (!title) return;

  const query = normaliseTitle(title);
  log('query:', query);
  if (query.length < 5) return;

  const url = await sendMessage('searchTracklist', { query });
  log('result: videoId=%s query=%s url=%s', videoId, query, url);
  await setCachedResult(videoId, url);

  if (url) injectIndicator(url);
}

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
  // Fallback: read from the HTML5 video element (reliable once player has loaded)
  const videoEl = document.querySelector<HTMLVideoElement>('video');
  if (videoEl && isFinite(videoEl.duration) && videoEl.duration > 0) {
    return Math.round(videoEl.duration);
  }
  return null;
}

// ytInitialPlayerResponse may not be populated yet at document_idle on direct
// page loads. Poll briefly before giving up.
async function waitForVideoDuration(maxWaitMs = 3000): Promise<number | null> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const d = getVideoDuration();
    if (d !== null) return d;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
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

function injectIndicator(tracklistUrl: string): void {
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
      text-decoration: none;
      font-family: sans-serif;
      line-height: 1.4;
    }
    #${INDICATOR_ID}:hover {
      background: #16213e;
      color: #fff;
    }
    #${INDICATOR_ID} img {
      width: 16px;
      height: 16px;
    }
  `,
  );

  const anchor = document.createElement('a');
  anchor.id = INDICATOR_ID;
  anchor.href = tracklistUrl;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';

  const img = document.createElement('img');
  img.src = browser.runtime.getURL('/icon/16.png');
  img.alt = '';
  anchor.appendChild(img);
  anchor.appendChild(document.createTextNode('Tracklist found on 1001tracklists'));

  // Insert below the video title
  const titleEl = document.querySelector('h1.ytd-watch-metadata');
  if (titleEl?.parentElement) {
    titleEl.parentElement.insertBefore(anchor, titleEl.nextSibling);
  }
}
