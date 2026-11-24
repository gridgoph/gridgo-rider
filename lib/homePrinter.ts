import type { HomePropertyType, Order, OrderStop } from "@/lib/api";
import { isValidLatLng, type LatLng } from "@/lib/geo";

/**
 * Jobs printed at a home printer: a person printing documents from their own
 * home, usually at night (gridgo-api `docs/HOME_PRINTERS_API.md`).
 *
 * The server decides what the rider may know, and this file only reads it.
 * An offer gives the barangay and nothing more. After Accept, while the job is
 * the rider's (`rider_assigned` to `awaiting_collection`), `order.pickup`
 * carries the exact pin with the private landmark and property type. Once the
 * job ends, the pin is gone from the answer, and so it is gone from the screen:
 * nothing here caches it.
 *
 * The printer's personal name is never sent, so the handoff asks plainly who
 * handed the job over rather than offering a name.
 */

type HomeFields = Partial<Pick<Order, "printerType" | "barangay" | "supplierContact" | "pickup">>;

/** The note the rider reads before they ride to someone's home. */
export const HOME_DISCREET_NOTE = "This is a private home, please be discreet.";

export function isHomePrinter(order: HomeFields): boolean {
  return order.printerType === "home" || order.supplierContact?.printerType === "home";
}

/** The home printer's barangay, from whichever field the API sent it on. */
export function homeBarangay(order: HomeFields): string | null {
  const value = order.barangay ?? order.supplierContact?.barangay ?? order.pickup?.barangay ?? null;
  return value?.trim() || null;
}

export type HomePickup = {
  point: LatLng;
  /** The street name the printer gave. Never a house number. */
  street: string | null;
  landmark: string | null;
  propertyType: HomePropertyType | null;
};

/**
 * The exact pickup, only when the API handed it over for this active job.
 * Null on an offer, a finished job, or a shop job.
 */
export function homeExactPickup(order: HomeFields): HomePickup | null {
  if (!isHomePrinter(order)) return null;
  const stop: OrderStop | null | undefined = order.pickup;
  // An offer's pickup is `{ barangay }` alone; the coordinates exist only on an active job.
  const point = stop ? { lat: stop.lat, lng: stop.lng } : null;
  if (!stop || !isValidLatLng(point)) return null;
  return {
    point,
    street: typeof stop.label === "string" ? stop.label.trim() || null : null,
    landmark: typeof stop.landmark === "string" ? stop.landmark.trim() || null : null,
    propertyType: stop.propertyType ?? null,
  };
}

/**
 * Where to pick up, in words. "Home printer, Barangay" until the job is the
 * rider's; then the street the printer gave, with the barangay.
 */
export function homePickupLabel(order: HomeFields): string {
  const barangay = homeBarangay(order);
  const street = homeExactPickup(order)?.street;
  if (street) return barangay && !street.includes(barangay) ? `${street}, ${barangay}` : street;
  return barangay ? `Home printer, ${barangay}` : "Home printer";
}

export function propertyTypeLabel(type: HomePropertyType | null): string | null {
  if (type === "house") return "House";
  if (type === "boarding_house") return "Boarding house";
  return null;
}

/**
 * The pickup line on an offer. The tag above it already says "Home printer",
 * so the stop is the barangay, with a note that the pin comes after Accept.
 */
export function homeOfferPickup(order: HomeFields): { label: string; note: string } | null {
  if (!isHomePrinter(order) || homeExactPickup(order)) return null;
  return { label: homeBarangay(order) ?? "Home printer", note: "Exact pin shows after you accept" };
}

/** "Boarding house · Blue gate" — what helps the rider find the door, or null. */
export function homeFindingLine(pickup: HomePickup): string | null {
  const parts = [propertyTypeLabel(pickup.propertyType), pickup.landmark].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** The words around the handoff signature, for a shop counter or a home. */
export type SignerCopy = {
  fieldLabel: string;
  placeholder: string;
  accessibilityLabel: string;
  missingName: string;
};

const SHOP_SIGNER: SignerCopy = {
  fieldLabel: "Name of the person signing",
  placeholder: "Who is signing for the shop",
  accessibilityLabel: "Name of the person signing for the shop",
  missingName: "Type the name of the person signing for the shop.",
};

const HOME_SIGNER: SignerCopy = {
  fieldLabel: "Who handed it over?",
  placeholder: "Ask them what name to write",
  accessibilityLabel: "Name of the person who handed the job over",
  missingName: "Type the name of the person who handed it over.",
};

export function signerCopy(order: HomeFields): SignerCopy {
  return isHomePrinter(order) ? HOME_SIGNER : SHOP_SIGNER;
}
