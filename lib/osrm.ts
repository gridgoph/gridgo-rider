/**
 * OSRM public demo routing for rider maps.
 *
 * Free, keyless, no SLA. Rate-limited. Callers must treat failure as normal
 * and fall back to a straight line — never block trip actions on routing.
 *
 * Path order is lon,lat (not lat,lng). Getting it backwards drops Davao in
 * the ocean — the classic bug for this stack.
 */

import {
  type LatLng,
  type LonLat,
  formatDistanceMetres,
  formatDurationSeconds,
  haversineMetres,
  isValidLatLng,
  straightLineGeometry,
  toLonLat,
} from "@/lib/geo";

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

export type RouteResult = {
  /** True when OSRM returned a road route; false for straight-line fallback. */
  routed: boolean;
  distanceMetres: number;
  durationSeconds: number;
  /** GeoJSON LineString coordinates as [lon, lat][]. */
  coordinates: LonLat[];
  /** Plain-language status for the rider when routing is unavailable. */
  statusLabel: string | null;
};

export type OsrmRouteResponse = {
  code?: string;
  routes?: {
    distance: number;
    duration: number;
    geometry?: {
      type?: string;
      coordinates?: LonLat[];
    };
  }[];
};

/**
 * Parse an OSRM JSON body into a RouteResult, or null if unusable.
 * Pure — unit-tested without the network.
 */
export function parseOsrmResponse(
  data: OsrmRouteResponse,
  from: LatLng,
  to: LatLng,
): RouteResult | null {
  if (data.code !== "Ok" || !data.routes?.length) return null;
  const route = data.routes[0]!;
  const coords = route.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  if (!Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
    return null;
  }
  return {
    routed: true,
    distanceMetres: route.distance,
    durationSeconds: route.duration,
    coordinates: coords,
    statusLabel: null,
  };
}

/** Straight-line fallback when OSRM is down, rate-limited, or malformed. */
export function fallbackRoute(from: LatLng, to: LatLng): RouteResult {
  const distanceMetres = haversineMetres(from, to);
  // Rough urban bike estimate: ~18 km/h → 5 m/s.
  const durationSeconds = distanceMetres / 5;
  return {
    routed: false,
    distanceMetres,
    durationSeconds,
    coordinates: straightLineGeometry(from, to).coordinates,
    statusLabel: "Route unavailable — straight line shown",
  };
}

/**
 * Fetch a driving route between two points.
 * Always resolves with a usable RouteResult; network failures use fallback.
 */
export async function fetchRoute(
  from: LatLng,
  to: LatLng,
  options?: { signal?: AbortSignal; fetchImpl?: typeof fetch },
): Promise<RouteResult> {
  if (!isValidLatLng(from) || !isValidLatLng(to)) {
    return {
      routed: false,
      distanceMetres: 0,
      durationSeconds: 0,
      coordinates: [],
      statusLabel: "Route unavailable — coordinates missing",
    };
  }

  // Same point — no request needed.
  if (from.lat === to.lat && from.lng === to.lng) {
    return {
      routed: true,
      distanceMetres: 0,
      durationSeconds: 0,
      coordinates: [toLonLat(from), toLonLat(to)],
      statusLabel: null,
    };
  }

  const [lon1, lat1] = toLonLat(from);
  const [lon2, lat2] = toLonLat(to);
  const url = `${OSRM_BASE}/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`;
  const doFetch = options?.fetchImpl ?? fetch;

  try {
    const res = await doFetch(url, {
      signal: options?.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return fallbackRoute(from, to);
    const data = (await res.json()) as OsrmRouteResponse;
    return parseOsrmResponse(data, from, to) ?? fallbackRoute(from, to);
  } catch {
    return fallbackRoute(from, to);
  }
}

/** Compact label pair for offer cards and trip headers. */
export function routeSummaryLabel(route: RouteResult | null): string {
  if (!route) return "Distance unknown";
  const dist = formatDistanceMetres(route.distanceMetres);
  const dur = formatDurationSeconds(route.durationSeconds);
  if (!route.routed) return `${dist} · ${dur} (est.)`;
  return `${dist} · ${dur}`;
}
