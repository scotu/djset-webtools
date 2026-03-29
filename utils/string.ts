const NOISE_PATTERNS: RegExp[] = [
  /\(official\s*(video|audio|mix|set|upload|dj\s*set)\)/gi,
  /\[official\s*(video|audio|mix|set|upload|dj\s*set)\]/gi,
  /\(full\s*(set|mix|live|dj\s*set)\)/gi,
  /\[full\s*(set|mix|live|dj\s*set)\]/gi,
  /\bHD\b/g,
  /\b4K\b/g,
  /\b1080[pi]\b/g,
  /\b720[pi]\b/g,
  /\bLIVE\b/g,
  /#\S+/g, // hashtags
  /\|[^|]+$/g, // "| Channel Name" suffix
];

/**
 * Clean up a YouTube video title for use as a 1001tracklists search query.
 * Removes common noise words and trims to a reasonable search length.
 */
export function normaliseTitle(title: string): string {
  let t = title;
  for (const pattern of NOISE_PATTERNS) {
    t = t.replace(pattern, '');
  }
  return t.replace(/\s+/g, ' ').trim().slice(0, 100);
}
