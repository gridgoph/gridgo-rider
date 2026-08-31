/**
 * Live print-shop directory for the Map tab.
 *
 * Pins come from `GET /catalog/shops` — the same shop points the API stores
 * for pickup. Shops without a usable lat/lng are dropped rather than guessed.
 */
import type { CatalogShopSummary } from "@/lib/api";
import { isValidLatLng, type LatLng } from "@/lib/geo";

export type DirectoryShop = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
};

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
