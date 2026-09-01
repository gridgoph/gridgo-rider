/**
 * GRIDGO's own counter in Davao — the collect pin a rider drives to.
 *
 * Captain-given point: 7.092287234449552, 125.61651084538697, Poblacion
 * District (maps.app.goo.gl/NHKkqQJVV7ZEKuq2A). Do not derive this from an
 * order record. Client and API copies are separate until those are updated too.
 */
import type { LatLng } from "@/lib/geo";

export const GRIDGO_OFFICE: LatLng & { label: string } = {
  lat: 7.092287234449552,
  lng: 125.61651084538697,
  label: "GRIDGO Office, Poblacion District, Davao City",
};

export const GRIDGO_OFFICE_LABEL = GRIDGO_OFFICE.label;
