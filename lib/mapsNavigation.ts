import { isValidLatLng, type LatLng } from "@/lib/geo";

/** Send the exact pin, never a label that Maps could geocode elsewhere. */
export function googleMapsDirectionsUrl(point: LatLng | null): string | null {
  if (!isValidLatLng(point)) return null;
  const destination = encodeURIComponent(`${point.lat},${point.lng}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}
