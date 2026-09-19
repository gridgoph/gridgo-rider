/**
 * CARTO dark raster tiles for night maps.
 *
 * The key is a public tile token (same class as a Mapbox public token). It
 * lives in gitignored `.env.local` as `EXPO_PUBLIC_CARTO_API_KEY` and is
 * inlined at bundle time. Never commit it. Light maps stay on OSM and do
 * not use this.
 *
 * Expo's Babel preset inlines EXPO_PUBLIC_* only as the literal member
 * expression `process.env.EXPO_PUBLIC_CARTO_API_KEY`. Reading it off a
 * variable named `env` leaves a keyless URL in a release bundle.
 */
const DARK_TILE_BASE =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

export function cartoApiKey(
  raw: string | undefined = process.env.EXPO_PUBLIC_CARTO_API_KEY,
): string | null {
  const key = raw?.trim();
  return key ? key : null;
}

export function cartoDarkTileUrl(
  raw: string | undefined = process.env.EXPO_PUBLIC_CARTO_API_KEY,
): string {
  const key = cartoApiKey(raw);
  if (!key) return DARK_TILE_BASE;
  return `${DARK_TILE_BASE}?key=${encodeURIComponent(key)}`;
}
