/**
 * Live print-shop directory for the Map tab.
 *
 * Pins come from `GET /catalog/shops` — the same shop points the API stores
 * for pickup — plus GRIDGO Office, which is not a catalog shop. Shops
 * without a usable lat/lng are dropped rather than guessed.
 */
import type { CatalogShopSummary } from "@/lib/api";
import { isValidLatLng, type LatLng } from "@/lib/geo";
import { GRIDGO_OFFICE } from "@/lib/gridgoOffice";

export type DirectoryPlaceKind = "shop" | "office";

export type DirectoryShop = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  kind?: DirectoryPlaceKind;
};

/** Stable Map-tab id so a pin tap and search hit the same place. */
export const GRIDGO_OFFICE_PLACE_ID = "gridgo-office";

export function gridgoOfficeDirectoryPlace(): DirectoryShop {
  return {
    id: GRIDGO_OFFICE_PLACE_ID,
    name: "GRIDGO Office",
    address: "Poblacion District, Davao City",
    lat: GRIDGO_OFFICE.lat,
    lng: GRIDGO_OFFICE.lng,
    kind: "office",
  };
}

/** Office first, then catalog shops. Never a second office pin. */
export function withGridgoOffice(shops: readonly DirectoryShop[]): DirectoryShop[] {
  const rest = shops.filter(
    (shop) => shop.id !== GRIDGO_OFFICE_PLACE_ID && shop.kind !== "office",
  );
  return [gridgoOfficeDirectoryPlace(), ...rest];
}

export function directoryShopFromCatalog(
  shop: CatalogShopSummary,
): DirectoryShop | null {
  const point = shop.shop;
  if (!point || !isValidLatLng({ lat: point.lat, lng: point.lng })) return null;
  const name = shop.shopName?.trim();
  if (!name) return null;
  return {
    id: shop.supplierId,
    name,
    address: point.label?.trim() || name,
    lat: point.lat,
    lng: point.lng,
  };
}

export function directoryShopsFromCatalog(
  shops: readonly CatalogShopSummary[],
): DirectoryShop[] {
  const mapped: DirectoryShop[] = [];
  for (const shop of shops) {
    const pin = directoryShopFromCatalog(shop);
    if (pin) mapped.push(pin);
  }
  return mapped;
}

export function filterDirectoryShops(
  shops: readonly DirectoryShop[],
  query: string,
): DirectoryShop[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return shops.slice();
  return shops.filter((shop) =>
    [shop.name, shop.address].some((value) => value.toLowerCase().includes(needle)),
  );
}

export function asMapPoint(shop: DirectoryShop): LatLng {
  return { lat: shop.lat, lng: shop.lng };
}
