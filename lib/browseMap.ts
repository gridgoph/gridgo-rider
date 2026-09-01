/**
 * City-map helpers for the Map tab.
 *
 * Trip maps stay on pickup / drop-off / route. This file is the browse
 * envelope: shop pins, a camera, and the one message a pin tap sends back.
 */

import type { DirectoryShop } from "@/lib/directoryShops";
import type { LatLng } from "@/lib/geo";
import type { MapPlace, MapView } from "@/lib/mapHtml";

export type BrowseMapTap = {
  type: "place";
  id: string;
};

export function shopsToMapPlaces(shops: readonly DirectoryShop[]): MapPlace[] {
  return shops.map((shop) => ({
    id: shop.id,
    name: shop.name,
    lat: shop.lat,
    lng: shop.lng,
  }));
}

export function viewOn(point: LatLng, zoom = 15): MapView {
  return { lat: point.lat, lng: point.lng, zoom };
}

/** First time Map opens: you, if GPS is already there; otherwise the city. */
export function firstOpenView(
  here: LatLng | null,
  fallback: LatLng,
  fallbackZoom: number,
): MapView {
  return here ? viewOn(here, 15) : viewOn(fallback, fallbackZoom);
}

export function parseBrowseMapMessage(raw: string): BrowseMapTap | null {
  try {
    const value = JSON.parse(raw) as { type?: unknown; id?: unknown };
    if (value.type !== "place" || typeof value.id !== "string" || !value.id.trim()) {
      return null;
    }
    return { type: "place", id: value.id };
  } catch {
    return null;
  }
}
