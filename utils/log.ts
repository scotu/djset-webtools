/**
 * Dev-only logger. Calls are compiled out entirely in production builds
 * because Vite statically replaces import.meta.env.DEV with `false` and
 * tree-shakes the dead branch.
 */
export function log(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.log('[djset-webtools]', ...args);
  }
}
