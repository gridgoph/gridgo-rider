/**
 * Pure geo helpers for rider maps.
 *
 * Coordinates are always { lat, lng } in app code. OSRM and GeoJSON use
 * [lon, lat] — convert only at the network/HTML boundary.
 */

export type LatLng = {
  lat: number;
  lng: number;
};

/** GeoJSON Position is [longitude, latitude] (± altitude). */
export type LonLat = [number, number];

export function isValidLatLng(point: LatLng | null | undefined): point is LatLng {
  if (!point) return false;
  const { lat, lng } = point;
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** App coords → OSRM / GeoJSON order. */
export function toLonLat(point: LatLng): LonLat {
  return [point.lng, point.lat];
}

/** GeoJSON / OSRM position → app coords. */
export function fromLonLat(position: LonLat | number[]): LatLng {
  return { lng: position[0]!, lat: position[1]! };
}

/**
 * Haversine great-circle distance in metres.
 * Used when OSRM is unavailable so the rider still sees a distance estimate.
 */
export function haversineMetres(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const sinΔφ = Math.sin(Δφ / 2);
  const sinΔλ = Math.sin(Δλ / 2);
  const h =
    sinΔφ * sinΔφ + Math.cos(φ1) * Math.cos(φ2) * sinΔλ * sinΔλ;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Format road (or fallback) distance for glanceable rider UI. */
export function formatDistanceMetres(metres: number): string {
  if (!Number.isFinite(metres) || metres < 0) return "—";
  if (metres < 1000) {
    return `${Math.round(metres)} m`;
  }
  const km = metres / 1000;
  if (km < 10) {
    return `${km.toFixed(1)} km`;
  }
  return `${Math.round(km)} km`;
}

/** Format duration seconds as a short ETA label. */
export function formatDurationSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const totalMins = Math.max(1, Math.round(seconds / 60));
  if (totalMins < 60) return `${totalMins} min`;
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Bounding box for a set of points, with a small padding so pins are not
 * flush against the map edge.
 */
export function boundsForPoints(
  points: LatLng[],
  padFraction = 0.12,
): { south: number; west: number; north: number; east: number } | null {
  const valid = points.filter(isValidLatLng);
  if (valid.length === 0) return null;

  let south = valid[0]!.lat;
  let north = valid[0]!.lat;
  let west = valid[0]!.lng;
  let east = valid[0]!.lng;

  for (const p of valid) {
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
  }

  // Degenerate (single point or coincident): pad by ~300m in degrees.
  const latPad = Math.max((north - south) * padFraction, 0.003);
  const lngPad = Math.max((east - west) * padFraction, 0.003);

  return {
    south: south - latPad,
    west: west - lngPad,
    north: north + latPad,
    east: east + lngPad,
  };
}

/**
 * Straight-line GeoJSON LineString between two points (lon,lat positions).
 * Fallback when OSRM fails — never blocks the trip.
 */
export function straightLineGeometry(a: LatLng, b: LatLng): {
  type: "LineString";
  coordinates: LonLat[];
} {
  return {
    type: "LineString",
    coordinates: [toLonLat(a), toLonLat(b)],
  };
}
