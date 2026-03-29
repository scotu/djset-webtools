import { defineExtensionMessaging } from '@webext-core/messaging';

interface ProtocolMap {
  /**
   * Search 1001tracklists for a matching tracklist.
   * Returns the URL of the first match, or null if none found.
   */
  searchTracklist(data: { query: string }): Promise<string | null>;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
