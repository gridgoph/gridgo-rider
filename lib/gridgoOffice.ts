/**
 * GRIDGO's own counter in Davao.
 *
 * Same pin as `gridgo-api/src/gridgo-office.js` and the client app. A rider
 * bringing a collected job leaves it here; the client never goes to the shop.
 * Coordinates came from the captain against a map pin — do not derive them
 * from an order record.
 */
import type { LatLng } from "@/lib/geo";

export const GRIDGO_OFFICE: LatLng & { label: string } = {
  lat: 7.13267,
  lng: 125.611265,
  label: "GRIDGO Office",
};

export const GRIDGO_OFFICE_LABEL = GRIDGO_OFFICE.label;
