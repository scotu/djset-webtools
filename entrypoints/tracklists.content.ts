import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { autoScrollEnabled, stickyYoutubeEnabled } from '../utils/storage';
import { injectStyle, removeElement } from '../utils/dom';

export default defineContentScript({
  matches: ['*://www.1001tracklists.com/tracklist/*'],
  runAt: 'document_idle',

  async main(ctx) {
    let scrollEnabled = await autoScrollEnabled.getValue();
    autoScrollEnabled.watch((v) => {
      scrollEnabled = v;
    });

    let stickyEnabled = await stickyYoutubeEnabled.getValue();
    stickyYoutubeEnabled.watch((v) => {
      stickyEnabled = v;
      if (!v) teardownStickyPlayer();
    });

    startActiveTrackObserver(ctx, () => scrollEnabled);
    startStickyYoutubeObserver(ctx, () => stickyEnabled);
  },
});

// ---------------------------------------------------------------------------
// Active track observer
// ---------------------------------------------------------------------------

function startActiveTrackObserver(ctx: ContentScriptContext, isScrollEnabled: () => boolean): void {
  const container = document.querySelector('#tlp') ?? document.body;

  let lastActiveEl: Element | null = null;
  let userScrolling = false;
  let userScrollTimer: ReturnType<typeof setTimeout> | undefined;

  const onWheel = () => {
    userScrolling = true;
    clearTimeout(userScrollTimer);
    userScrollTimer = setTimeout(() => {
      userScrolling = false;
    }, 3000);
  };
  window.addEventListener('wheel', onWheel, { passive: true });

  // The site marks the current track by adding .cPlay to the .trRowN element
  // (confirmed from framework.js: $(".trRow"+n).addClass("cPlay")).
  // .trRowN is a class on the same .bItm element, so .closest('.bItm') finds it.
  const observer = new MutationObserver(() => {
    const cplayEl = document.querySelector<HTMLElement>('.cPlay');
    const active = cplayEl?.closest<HTMLElement>('.bItm') ?? cplayEl;
    if (!active || active === lastActiveEl) return;
    lastActiveEl = active;
    if (isScrollEnabled() && !userScrolling) scrollToTrack(active);
  });

  observer.observe(container, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  ctx.onInvalidated(() => {
    observer.disconnect();
    window.removeEventListener('wheel', onWheel);
    clearTimeout(userScrollTimer);
  });

  // Handle a track that is already current on page load.
  const initialCplay = document.querySelector<HTMLElement>('.cPlay');
  const initial = initialCplay?.closest<HTMLElement>('.bItm') ?? initialCplay;
  if (initial) {
    lastActiveEl = initial;
    if (isScrollEnabled()) scrollToTrack(initial);
  }
}

// ---------------------------------------------------------------------------
// Feature: auto-scroll
// ---------------------------------------------------------------------------

function scrollToTrack(activeItem: HTMLElement): void {
  activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---------------------------------------------------------------------------
// Feature: sticky YouTube player
// ---------------------------------------------------------------------------

const STICKY_STYLE_ID = 'tlt-sticky-yt-style';
const STICKY_CLASS = 'tlt-sticky-iframe';
const STICKY_PLACEHOLDER_ID = 'tlt-sticky-placeholder';
const STICKY_SENTINEL_ID = 'tlt-sticky-sentinel';

const STICKY_CSS = `
.${STICKY_CLASS} {
  position: fixed !important;
  top: 8px !important;
  right: 8px !important;
  width: 320px !important;
  height: 180px !important;
  z-index: 99999 !important;
  box-shadow: 0 4px 24px rgba(0,0,0,.6);
  border-radius: 6px;
}
`;

let originalIframe: HTMLIFrameElement | null = null;

function attachStickyPlayer(iframe: HTMLIFrameElement): void {
  if (iframe.classList.contains(STICKY_CLASS)) return;
  injectStyle(STICKY_STYLE_ID, STICKY_CSS);

  // Insert a same-size placeholder so the page layout doesn't shift when the
  // iframe leaves the normal flow.
  const placeholder = document.createElement('div');
  placeholder.id = STICKY_PLACEHOLDER_ID;
  placeholder.style.width = iframe.offsetWidth + 'px';
  placeholder.style.height = iframe.offsetHeight + 'px';
  iframe.parentNode?.insertBefore(placeholder, iframe);

  iframe.classList.add(STICKY_CLASS);
}

function teardownStickyPlayer(): void {
  if (originalIframe) originalIframe.classList.remove(STICKY_CLASS);
  removeElement(`#${STICKY_PLACEHOLDER_ID}`);
}

function startStickyYoutubeObserver(ctx: ContentScriptContext, isEnabled: () => boolean): void {
  let mutObs: MutationObserver | null = null;
  let io: IntersectionObserver | null = null;

  function observe(iframe: HTMLIFrameElement): void {
    originalIframe = iframe;
    mutObs?.disconnect();
    mutObs = null;

    // Observe a 0-height sentinel inserted before the iframe rather than the
    // iframe itself. Applying position:fixed to the iframe would change its
    // intersection and cause a feedback loop.
    const sentinel = document.createElement('div');
    sentinel.id = STICKY_SENTINEL_ID;
    iframe.parentNode?.insertBefore(sentinel, iframe);

    io = new IntersectionObserver(
      (entries) => {
        if (!isEnabled()) return;
        if (!entries[0].isIntersecting) {
          attachStickyPlayer(iframe);
        } else {
          teardownStickyPlayer();
        }
      },
      { threshold: 0 },
    );
    io.observe(sentinel);
  }

  const existing = document.querySelector<HTMLIFrameElement>(
    'iframe[src*="youtube"][src*="/embed/"]',
  );
  if (existing) {
    observe(existing);
  } else {
    // The embed iframe is in the DOM at load time but gets its src set lazily by the site's JS.
    // Watch both childList (new iframes added) and src attribute changes on existing iframes.
    mutObs = new MutationObserver(() => {
      const found = document.querySelector<HTMLIFrameElement>(
        'iframe[src*="youtube"][src*="/embed/"]',
      );
      if (found) observe(found);
    });
    mutObs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'],
    });
  }

  ctx.onInvalidated(() => {
    io?.disconnect();
    mutObs?.disconnect();
    teardownStickyPlayer();
    removeElement(`#${STICKY_SENTINEL_ID}`);
  });
}
