/**
 * Files in client/public/ are served as-is and don't go through Vite's asset
 * pipeline, so a hardcoded "/foo.svg" ignores the configured base path (e.g.
 * demo builds served at joavn.dev/dashboard/). Prefix with BASE_URL instead.
 */
export function publicAsset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}
