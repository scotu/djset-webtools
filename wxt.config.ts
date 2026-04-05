import { defineConfig } from 'wxt';

export default defineConfig({
  vite: ({ mode }) => ({
    build: {
      sourcemap: mode === 'development',
    },
  }),
  manifest: ({ browser }) => ({
    name: 'djset-webtools',
    description: 'YouTube ↔ 1001tracklists integration for DJ set listeners',
    permissions: ['storage'],
    host_permissions: ['https://www.youtube.com/*', 'https://www.1001tracklists.com/*'],
    // Extensions page, about:addons, etc. — always light background, use dark icon.
    icons: {
      16: 'icon/16-dark.png',
      32: 'icon/32-dark.png',
      48: 'icon/48-dark.png',
      96: 'icon/96-dark.png',
      128: 'icon/128-dark.png',
    },
    web_accessible_resources: [
      {
        resources: ['icon/*'],
        matches: ['https://www.youtube.com/*'],
      },
    ],
    action: {
      default_icon: {
        16: 'icon/16-dark.png',
        32: 'icon/32-dark.png',
        48: 'icon/48-dark.png',
        128: 'icon/128-dark.png',
      },
    },
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: '@djw.smol.tech',
          // The extension sends the normalised YouTube video title to 1001tracklists.com
          // to look up a matching tracklist — this constitutes browsingActivity under the
          // Firefox data taxonomy (information about which videos/pages the user views).
          data_collection_permissions: {
            required: ['browsingActivity'],
          },
        },
      },
    }),
  }),
});
