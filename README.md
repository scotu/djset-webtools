# djset-webtools

A browser extension that improves the experience of listening to DJ sets on YouTube and [1001tracklists.com](https://www.1001tracklists.com).

Supports **Chrome** (Manifest V3) and **Firefox** (Manifest V2).

---

## Features

### YouTube → 1001tracklists indicator
When you open a YouTube video longer than 30 minutes, the extension searches 1001tracklists for a matching tracklist. If one is found, a link appears below the video title so you can open the tracklist without leaving YouTube.

> Results are cached per video ID so subsequent visits are instant and don't hit the network.

### Auto-scroll to current track *(1001tracklists)*
The tracklist automatically scrolls to keep the currently playing track visible. Auto-scroll pauses for 3 seconds after you scroll manually, then resumes.

### Sticky YouTube player *(1001tracklists)*
When you scroll past the YouTube embed at the top of a tracklist page, it reappears as a floating player in the top-right corner of the viewport. Scroll back up to dismiss it.

All features can be toggled independently from the extension's options page.

---

## Development

### Requirements

- [Node.js](https://nodejs.org) 18+
- [pnpm](https://pnpm.io) 8+

### Setup

```bash
pnpm install
```

### Dev mode (with HMR)

```bash
# Chrome
pnpm dev

# Firefox
pnpm dev:firefox
```

### Build

```bash
# Chrome (outputs to .output/chrome-mv3/)
pnpm build

# Firefox (outputs to .output/firefox-mv2/)
pnpm build:firefox
```

### Tests

```bash
# Unit tests (Vitest)
pnpm test

# Unit tests in watch mode
pnpm test:watch

# E2E tests (Playwright — requires a production build first)
pnpm build && pnpm test:e2e
```

---

## Loading the extension in your browser

### Chrome / Chromium

1. Run `pnpm build` (or `pnpm dev` to keep it rebuilding on changes)
2. Open `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the `.output/chrome-mv3/` folder inside this project

The extension icon appears in the toolbar. Open the options page from the extensions menu to configure features.

### Firefox

1. Run `pnpm build:firefox` (or `pnpm dev:firefox`)
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on…**
4. Select **any file** inside the `.output/firefox-mv2/` folder (e.g. `manifest.json`)

> Temporary add-ons are removed when Firefox restarts. For persistent installation during development, use `pnpm dev:firefox` which keeps the extension loaded via `web-ext`.

---

## Testing the features manually

### YouTube indicator

1. Load the extension
2. Open any YouTube DJ set longer than 30 minutes — for example https://www.youtube.com/watch?v=_jysvzxpb0Q
3. A **"Tracklist found on 1001tracklists"** link should appear below the video title within a few seconds (time depends on network)
4. Short videos (< 30 min) should show nothing

### Auto-scroll

1. On the same tracklist page with a playing set, scroll away from the current track
2. After manual scrolling the autoscroll behavior is disabled for 3 seconds, when the track changes again after the 3 seconds, the page should smoothly scroll back to the new current track

### Sticky YouTube player

1. Open a tracklist page that has a YouTube embed at the top
2. Scroll down past the video player — a small floating player should appear in the top-right corner
3. Scroll back up — the floating player should disappear and the original embed returns to normal
4. Disable **Sticky YouTube player** in the options page — scrolling should no longer produce the floating player

### Options page

- **Chrome**: right-click the extension icon → *Options*, or go to `chrome://extensions` → Details → Extension options
- **Firefox**: right-click the extension icon → *Manage Extension* → Preferences

Toggle each feature and verify the behaviour starts/stops immediately on the open tab.

---

## Project structure

```
djset-webtools/
├── entrypoints/
│   ├── background.ts            # Cross-origin fetch handler (1001tl search)
│   ├── youtube.content.ts       # YouTube: indicator injection
│   ├── tracklists.content.ts    # 1001tl: widget injection + auto-scroll
│   └── options/                 # Settings page
│       ├── index.html
│       └── main.ts
├── utils/
│   ├── messaging.ts             # Typed content ↔ background message protocol
│   ├── storage.ts               # Extension storage items + cache helpers
│   ├── string.ts                # Title normalisation for search queries
│   └── dom.ts                   # DOM helpers
├── tests/                       # Unit tests for entrypoints
├── e2e/                         # Playwright E2E specs
├── public/icon/                 # Extension icons
├── wxt.config.ts                # WXT / manifest configuration
├── vitest.config.ts             # Unit test configuration
└── playwright.config.ts         # E2E test configuration
```

---

## Known selector dependencies

The 1001tracklists features rely on the following live DOM selectors, confirmed by inspection of the site's CSS and JS (March 2026):

| Purpose | Selector |
|---|---|
| Player widget | `#playerWidget` — `position: fixed; bottom: 0` |
| Current track | `.cPlay` (added by site JS to `.trRowN` elements) |
| Track item container | `.bItm` |
| Track action links | `.iRow a`, `.iRow button` |
| YouTube embed (tracklist page) | `iframe[src*="youtube"][src*="/embed/"]` |

If 1001tracklists redesigns their site, these may need updating.

---

## Tech stack

| Tool | Role |
|---|---|
| [WXT](https://wxt.dev) | Extension build framework (Vite-based, cross-browser) |
| TypeScript | Language |
| [Vitest](https://vitest.dev) | Unit tests |
| [Playwright](https://playwright.dev) | E2E tests |
| [@webext-core/messaging](https://webext-core.aklinker1.io/messaging/) | Typed cross-context messaging |
| [@webext-core/fake-browser](https://webext-core.aklinker1.io/fake-browser/) | Browser API mock for unit tests |
