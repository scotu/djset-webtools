import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import {
  autoScrollEnabled,
  stickyYoutubeEnabled,
  stickyPlayerCorner,
  stickyPlayerSize,
} from '../utils/storage';
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

    const savedCorner = await stickyPlayerCorner.getValue();
    const savedSize = await stickyPlayerSize.getValue();
    activeCorner = savedCorner;
    activeWidth = savedSize.width;
    activeHeight = savedSize.height;

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

type Corner = 'tr' | 'tl' | 'br' | 'bl';
const OPPOSITE: Record<Corner, Corner> = { tr: 'bl', tl: 'br', br: 'tl', bl: 'tr' };

const STICKY_STYLE_ID = 'tlt-sticky-yt-style';
const STICKY_CLASS = 'tlt-sticky-iframe';
const STICKY_PLACEHOLDER_ID = 'tlt-sticky-placeholder';
const STICKY_SENTINEL_ID = 'tlt-sticky-sentinel';
const STICKY_CONTROLS_ID = 'tlt-sticky-controls';

const STICKY_CSS = `
.tlt-sticky-iframe {
  position: fixed !important;
  z-index: 99999 !important;
  box-shadow: 0 4px 24px rgba(0,0,0,.6) !important;
  border-radius: 6px !important;
}
#tlt-sticky-controls {
  position: fixed;
  z-index: 100000;
  pointer-events: none;
  border-radius: 6px;
}
#tlt-sticky-drag-bar {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 22px;
  pointer-events: auto;
  cursor: grab;
  background: linear-gradient(rgba(0,0,0,0.55), transparent);
  border-radius: 6px 6px 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
}
#tlt-sticky-drag-bar:hover, #tlt-sticky-drag-bar.dragging { opacity: 1; }
#tlt-sticky-drag-bar.dragging { cursor: grabbing; }
#tlt-sticky-drag-bar::after {
  content: '';
  display: block;
  width: 24px; height: 3px;
  background: rgba(255,255,255,0.65);
  border-radius: 2px;
}
.tlt-resize-handle {
  position: absolute;
  pointer-events: auto;
  width: 22px; height: 22px;
  opacity: 0;
  transition: opacity 0.15s;
}
.tlt-resize-handle:hover { opacity: 1; }
.tlt-resize-handle::before {
  content: '';
  position: absolute;
  inset: 5px;
  border-color: rgba(255,255,255,0.75);
  border-style: solid;
  border-width: 0;
}
.tlt-resize-tl { top: 0; left: 0; cursor: nwse-resize; }
.tlt-resize-tl::before { border-top-width: 2px; border-left-width: 2px; }
.tlt-resize-tr { top: 0; right: 0; cursor: nesw-resize; }
.tlt-resize-tr::before { border-top-width: 2px; border-right-width: 2px; }
.tlt-resize-bl { bottom: 0; left: 0; cursor: nesw-resize; }
.tlt-resize-bl::before { border-bottom-width: 2px; border-left-width: 2px; }
.tlt-resize-br { bottom: 0; right: 0; cursor: nwse-resize; }
.tlt-resize-br::before { border-bottom-width: 2px; border-right-width: 2px; }
`;

let originalIframe: HTMLIFrameElement | null = null;
let activeCorner: Corner = 'tr';
let activeWidth = 320;
let activeHeight = 180;

function positionEl(el: HTMLElement): void {
  const isTop = activeCorner[0] === 't';
  const isRight = activeCorner[1] === 'r';
  el.style.top = isTop ? '8px' : 'auto';
  el.style.bottom = isTop ? 'auto' : '8px';
  el.style.right = isRight ? '8px' : 'auto';
  el.style.left = isRight ? 'auto' : '8px';
  el.style.width = activeWidth + 'px';
  el.style.height = activeHeight + 'px';
}

function attachStickyPlayer(iframe: HTMLIFrameElement): void {
  if (iframe.classList.contains(STICKY_CLASS)) return;
  injectStyle(STICKY_STYLE_ID, STICKY_CSS);

  const placeholder = document.createElement('div');
  placeholder.id = STICKY_PLACEHOLDER_ID;
  placeholder.style.width = iframe.offsetWidth + 'px';
  placeholder.style.height = iframe.offsetHeight + 'px';
  iframe.parentNode?.insertBefore(placeholder, iframe);

  iframe.classList.add(STICKY_CLASS);
  positionEl(iframe);
  buildControls(iframe);
}

function teardownStickyPlayer(): void {
  if (originalIframe) {
    originalIframe.classList.remove(STICKY_CLASS);
    for (const p of ['top', 'bottom', 'left', 'right', 'width', 'height'] as const) {
      originalIframe.style[p] = '';
    }
  }
  removeElement(`#${STICKY_PLACEHOLDER_ID}`);
  removeElement(`#${STICKY_CONTROLS_ID}`);
}

function buildControls(iframe: HTMLIFrameElement): void {
  removeElement(`#${STICKY_CONTROLS_ID}`);
  const controls = document.createElement('div');
  controls.id = STICKY_CONTROLS_ID;
  positionEl(controls);

  const dragBar = document.createElement('div');
  dragBar.id = 'tlt-sticky-drag-bar';
  dragBar.addEventListener('mousedown', (e) => startDrag(iframe, controls, dragBar, e));
  controls.appendChild(dragBar);

  const handle = document.createElement('div');
  handle.className = `tlt-resize-handle tlt-resize-${OPPOSITE[activeCorner]}`;
  handle.addEventListener('mousedown', (e) => startResize(iframe, controls, e));
  controls.appendChild(handle);

  document.body.appendChild(controls);
}

function startDrag(
  iframe: HTMLIFrameElement,
  controls: HTMLElement,
  dragBar: HTMLElement,
  e: MouseEvent,
): void {
  e.preventDefault();
  dragBar.classList.add('dragging');

  const capture = document.createElement('div');
  capture.style.cssText = 'position:fixed;inset:0;z-index:999999;cursor:grabbing';
  document.body.appendChild(capture);

  const rect = iframe.getBoundingClientRect();
  let x = rect.left;
  let y = rect.top;

  function freePos(el: HTMLElement): void {
    el.style.top = y + 'px';
    el.style.bottom = 'auto';
    el.style.left = x + 'px';
    el.style.right = 'auto';
    el.style.width = activeWidth + 'px';
    el.style.height = activeHeight + 'px';
  }

  freePos(iframe);
  freePos(controls);

  const originX = e.clientX - x;
  const originY = e.clientY - y;

  function onMove(ev: MouseEvent): void {
    x = Math.max(0, Math.min(window.innerWidth - activeWidth, ev.clientX - originX));
    y = Math.max(0, Math.min(window.innerHeight - activeHeight, ev.clientY - originY));
    freePos(iframe);
    freePos(controls);
  }

  function onUp(): void {
    capture.remove();
    dragBar.classList.remove('dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);

    // Snap to the quadrant the player centre landed in.
    const cx = x + activeWidth / 2;
    const cy = y + activeHeight / 2;
    activeCorner = ((cy < window.innerHeight / 2 ? 't' : 'b') +
      (cx < window.innerWidth / 2 ? 'l' : 'r')) as Corner;

    positionEl(iframe);
    stickyPlayerCorner.setValue(activeCorner);
    buildControls(iframe);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function startResize(iframe: HTMLIFrameElement, controls: HTMLElement, e: MouseEvent): void {
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const startW = activeWidth;
  const startH = activeHeight;
  const ratio = startW / startH;
  const isRight = activeCorner[1] === 'r';
  const isTop = activeCorner[0] === 't';
  const cursor = isRight === isTop ? 'nwse-resize' : 'nesw-resize';

  // Full-screen capture div prevents the cross-origin iframe from swallowing
  // mousemove events when the cursor moves inside the embed during resize.
  const capture = document.createElement('div');
  capture.style.cssText = `position:fixed;inset:0;z-index:999999;cursor:${cursor}`;
  document.body.appendChild(capture);

  function onMove(ev: MouseEvent): void {
    const dx = isRight ? startX - ev.clientX : ev.clientX - startX;
    const dy = isTop ? ev.clientY - startY : startY - ev.clientY;
    activeWidth = Math.max(240, startW + (dx + dy) / 2);
    activeHeight = Math.round(activeWidth / ratio);
    positionEl(iframe);
    positionEl(controls);
  }

  function onUp(): void {
    capture.remove();
    stickyPlayerSize.setValue({ width: activeWidth, height: activeHeight });
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
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
