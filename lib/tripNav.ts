/**
 * Where the rider rides next, and what the map should pin.
 *
 * Two legs, always in this order:
 *   1. GPS → the assigned print shop (collect the job)
 *   2. GPS → the client, or GRIDGO Office when the client collects there
 *
 * Shop coordinates come from the order. The office pin is the one GRIDGO
 * owner constant — never a guessed address. Missing GPS means no invented
 * origin: the destination still pins, and the route waits for a fix.
 */
import type { Order } from "@/lib/api";
import { haversineMetres, isValidLatLng, type LatLng } from "@/lib/geo";
import { GRIDGO_OFFICE, GRIDGO_OFFICE_LABEL } from "@/lib/gridgoOffice";
import { activeStopKind, dropoffLabel, pickupLabel, stopLatLng, type TripPhase } from "@/lib/riderOrder";

/** How far the rider must move before we ask the road router again. */
export const ROUTE_SNAP_METRES = 80;

const OFFICE_MATCH_METRES = 40;

export type NextStopKind = "shop" | "client" | "office";

export type NextStop = {
  kind: NextStopKind;
  /** Drives the NextStopCard icon: pickup = shop, dropoff = client/office. */
  cardKind: "pickup" | "dropoff";
  point: LatLng | null;
  label: string;
  overline: string;
  heading: string;
  navTitle: string;
};

export function isGridgoOfficePoint(point: LatLng | null | undefined): boolean {
  if (!isValidLatLng(point)) return false;
  return haversineMetres(point, GRIDGO_OFFICE) <= OFFICE_MATCH_METRES;
}

/**
 * After the shop: the client door, or GRIDGO's counter for a collect job.
 */
export function tripDestination(
  order: Pick<Order, "dropoff" | "address" | "fulfillmentMode">,
): NextStop {
  if (order.fulfillmentMode === "pickup" || isGridgoOfficePoint(stopLatLng(order.dropoff))) {
    return {
      kind: "office",
      cardKind: "dropoff",
      point: { lat: GRIDGO_OFFICE.lat, lng: GRIDGO_OFFICE.lng },
      label: GRIDGO_OFFICE_LABEL,
      overline: "NEXT STOP · GRIDGO OFFICE",
      heading: "Leave the finished job at the GRIDGO counter",
      navTitle: "TO GRIDGO OFFICE",
    };
  }
  const point = stopLatLng(order.dropoff);
  return {
    kind: "client",
    cardKind: "dropoff",
    point,
    label: dropoffLabel(order),
    overline: "NEXT STOP · CLIENT",
    heading: "Hand the package to the client",
    navTitle: "TO THE CLIENT",
  };
}

export function tripShop(
  order: Pick<Order, "pickup" | "zone">,
): NextStop {
  return {
    kind: "shop",
    cardKind: "pickup",
    point: stopLatLng(order.pickup),
    label: pickupLabel(order),
    overline: "NEXT STOP · SHOP",
    heading: "Check the finished job at the counter before you carry it",
    navTitle: "TO THE SHOP",
  };
}

/** The stop the rider is riding toward right now. */
export function nextStop(order: Order, phase: TripPhase): NextStop | null {
  const heading = activeStopKind(phase);
  if (heading === "pickup") return tripShop(order);
  if (heading === "dropoff") return tripDestination(order);
  return null;
}

/**
 * Keep the road-router origin still until the rider has actually moved.
 * Public OSRM cannot take a new request on every GPS tick.
 */
export function snapRouteOrigin(
  live: LatLng | null | undefined,
  previous: LatLng | null | undefined,
  thresholdMetres: number = ROUTE_SNAP_METRES,
): LatLng | null {
  if (!isValidLatLng(live)) return isValidLatLng(previous) ? previous : null;
  if (!isValidLatLng(previous)) return live;
  if (haversineMetres(previous, live) >= thresholdMetres) return live;
  return previous;
}
