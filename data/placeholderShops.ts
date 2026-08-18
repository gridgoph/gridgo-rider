/**
 * Stand-in supplier directory for the Map tab.
 *
 * GRIDGO does not yet publish shop coordinates from the API, so this file is
 * the only source the Map screen reads. The shape is the one a later
 * `GET /suppliers` (or equivalent) should keep: identity, a name a rider would
 * say out loud, a Davao area, a street line, and a point. `placeholder: true`
 * is what keeps a pin from reading as a live dispatch stop.
 *
 * Swap the array for a network call; keep `PlaceholderShop` and
 * `filterPlaceholderShops`. Do not invent a second shop type next to this one.
 */

import type { LatLng } from "@/lib/geo";

export type PlaceholderShop = {
  id: string;
  name: string;
  /** Neighbourhood a Davao rider already uses — Bajada, not a barangay code. */
  area: string;
  address: string;
  lat: number;
  lng: number;
  placeholder: true;
};

/** Same fallback the trip map uses when it has nothing else to show. */
export const DAVAO_MAP_CENTER: LatLng = { lat: 7.1907, lng: 125.4553 };

export const DAVAO_MAP_ZOOM = 13;

/**
 * A handful of print shops around the Davao streets this pilot actually rides.
 * Coordinates are approximate neighbourhood centres, not surveyed doorways.
 */
export const PLACEHOLDER_SHOPS: readonly PlaceholderShop[] = [
  {
    id: "shop-talasora-bajada",
    name: "Talasora Press",
    area: "Bajada",
    address: "J. P. Laurel Avenue, Bajada",
    lat: 7.0984,
    lng: 125.6132,
    placeholder: true,
  },
  {
    id: "shop-vicenta",
    name: "Vicenta Print House",
    area: "Obrero",
    address: "Near Doña Vicenta Park, Obrero",
    lat: 7.0736,
    lng: 125.6139,
    placeholder: true,
  },
  {
    id: "shop-laurel-copy",
    name: "Laurel Copy Desk",
    area: "Bajada",
    address: "J. P. Laurel Avenue, Bajada",
    lat: 7.0871,
    lng: 125.6124,
    placeholder: true,
  },
  {
    id: "shop-agdao-ink",
    name: "Agdao Ink & Paper",
    area: "Agdao",
    address: "Lapu-Lapu Street, Agdao",
    lat: 7.0822,
    lng: 125.6231,
    placeholder: true,
  },
  {
    id: "shop-matina-bindery",
    name: "Matina Bindery",
    area: "Matina",
    address: "McArthur Highway, Matina",
    lat: 7.0618,
    lng: 125.5914,
    placeholder: true,
  },
  {
    id: "shop-buhangin-wide",
    name: "Buhangin Wide Format",
    area: "Buhangin",
    address: "Buhangin Road, Buhangin",
    lat: 7.1164,
    lng: 125.6258,
    placeholder: true,
  },
];

export function filterPlaceholderShops(
  shops: readonly PlaceholderShop[],
  query: string,
): PlaceholderShop[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return shops.slice();
  return shops.filter((shop) =>
    [shop.name, shop.area, shop.address].some((value) =>
      value.toLowerCase().includes(needle),
    ),
  );
}
