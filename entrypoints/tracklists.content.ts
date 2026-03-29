import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { autoScrollEnabled } from '../utils/storage';

export default defineContentScript({
  matches: ['*://www.1001tracklists.com/tracklist/*'],
  runAt: 'document_idle',

  async main(ctx) {
    let scrollEnabled = await autoScrollEnabled.getValue();
    autoScrollEnabled.watch((v) => {
      scrollEnabled = v;
    });

    startActiveTrackObserver(ctx, () => scrollEnabled);
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
