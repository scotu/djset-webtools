import { defineExtensionMessaging } from '@webext-core/messaging';

interface ProtocolMap {
  /**
   * Search 1001tracklists for a matching tracklist.
   * Returns the tracklist URL if a confident match is found, the search-page URL otherwise, or null on error.
   */
  searchTracklist(data: { query: string }): Promise<string | null>;
  /**
   * Ask the background to open a URL in a new tab.
   * Required for chrome-extension:// URLs, which web pages cannot navigate to directly.
   */
  openSearchTab(data: { url: string }): Promise<void>;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
