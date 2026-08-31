/**
 * CARTO dark raster tiles for night maps.
 *
 * The key is a public tile token (same class as a Mapbox public token). It
 * lives in gitignored `.env.local` as `EXPO_PUBLIC_CARTO_API_KEY` and is
 * inlined at bundle time. Never commit it. Light maps stay on OSM and do
 * not use this.
 */
const DARK_TILE_BASE =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

export function cartoApiKey(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string | null {
  const raw = env.EXPO_PUBLIC_CARTO_API_KEY?.trim();
  return raw ? raw : null;
}

export function cartoDarkTileUrl(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  const key = cartoApiKey(env);
  if (!key) return DARK_TILE_BASE;
  return `${DARK_TILE_BASE}?key=${encodeURIComponent(key)}`;
}
