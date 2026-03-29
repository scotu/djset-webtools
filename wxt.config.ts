import { defineConfig } from 'wxt';

export default defineConfig({
  vite: ({ mode }) => ({
    build: {
      sourcemap: mode === 'development',
    },
  }),
  manifest: {
    name: 'djset-webtools',
    description: 'YouTube ↔ 1001tracklists integration for DJ set listeners',
    permissions: ['storage'],
    host_permissions: ['https://www.youtube.com/*', 'https://www.1001tracklists.com/*'],
    action: {},
  },
});
