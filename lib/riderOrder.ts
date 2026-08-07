import type { Order, OrderStop } from "@/lib/api";
import type { LatLng } from "@/lib/geo";
import { isValidLatLng } from "@/lib/geo";

/** States where this rider is mid-job. */
export const ACTIVE_TRIP_STATES = [
  "rider_assigned",
  "picked_up",
  "out_for_delivery",
] as const;

export type ActiveTripState = (typeof ACTIVE_TRIP_STATES)[number];

/** Trip phases the Active screen drives, in order. */
export type TripPhase =
  | "pickup"
  | "start_delivery"
  | "collect_cod"
  | "delivery_proof"
  | "complete"
  | "idle";

/** Failure reasons the rider can record (plain language; never snake_case on screen). */
export const FAILURE_REASONS = [
  { id: "unavailable", label: "Client not available" },
  { id: "wrong_address", label: "Wrong or incomplete address" },
  { id: "refused", label: "Client refused the package" },
  { id: "access", label: "Could not access the site" },
  { id: "other", label: "Other" },
] as const;

export type FailureReasonId = (typeof FAILURE_REASONS)[number]["id"];

const ZONE_LABELS: Record<string, string> = {
  davao_central: "Davao Central",
  davao_south: "Davao South",
  davao_north: "Davao North",
  davao_east: "Davao East",
  davao_west: "Davao West",
};

/**
 * Plain-language state labels. Internal enums never reach the screen.
 */
export function orderStateLabel(state: string): string {
  switch (state) {
    case "ready_for_dispatch":
      return "Ready for pickup";
    case "rider_assigned":
      return "Head to pickup";
    case "picked_up":
      return "Package with you";
    case "out_for_delivery":
      return "Out for delivery";
    case "delivered":
      return "Delivered";
    case "issue_window_open":
      return "Delivery complete";
    case "completed":
      return "Closed";
    default:
      return "In progress";
  }
}

/** Status chip presentation for an order state. Always icon + label + tone. */
export function orderStateChip(state: string): {
  label: string;
  tone: "success" | "warning" | "error" | "info" | "neutral";
  icon: "circle-check" | "triangle-alert" | "circle-x" | "clock" | "square-pen";
} {
  switch (state) {
    case "ready_for_dispatch":
      return { label: "Ready for pickup", tone: "info", icon: "clock" };
    case "rider_assigned":
      return { label: "Head to pickup", tone: "warning", icon: "triangle-alert" };
    case "picked_up":
      return { label: "Package with you", tone: "info", icon: "circle-check" };
    case "out_for_delivery":
      return { label: "Out for delivery", tone: "info", icon: "clock" };
    case "issue_window_open":
    case "delivered":
      return { label: "Delivery complete", tone: "success", icon: "circle-check" };
    default:
      return { label: orderStateLabel(state), tone: "neutral", icon: "clock" };
  }
}

/** Human zone name for a zone code. */
export function zoneLabel(zone: string): string {
  if (!zone) return "Zone unknown";
  return ZONE_LABELS[zone] ?? zone.replaceAll("_", " ");
}

/** Cash the rider must collect: order total + delivery fee, in centavos. */
export function codAmountDueMinor(order: Pick<Order, "totalMinor" | "deliveryFeeMinor">): number {
  return order.totalMinor + order.deliveryFeeMinor;
}

/** Whether this order requires COD collection before delivery can complete. */
export function isCodOrder(order: Pick<Order, "paymentMethod">): boolean {
  return order.paymentMethod === "cod";
}

/**
 * COD is recorded when paymentStatus is collected/reconciled, or when a cod
 * proof has already been posted this session.
 */
export function isCodCollected(
  order: Pick<Order, "paymentMethod" | "paymentStatus">,
): boolean {
  if (!isCodOrder(order)) return true;
  return order.paymentStatus === "collected" || order.paymentStatus === "reconciled";
}

/**
 * Whether location sharing is required for this trip state.
 * Only while the package is in transit with the rider.
 */
export function shouldShareLocation(state: string): boolean {
  return state === "picked_up" || state === "out_for_delivery";
}

export function isActiveTripState(state: string): state is ActiveTripState {
  return (ACTIVE_TRIP_STATES as readonly string[]).includes(state);
}

/**
 * Single active trip for this rider, if any.
 * One job at a time — newest update wins if the API ever returns more.
 */
export function selectActiveTrip(orders: Order[], riderId: string): Order | null {
  const mine = orders
    .filter((o) => o.riderId === riderId && isActiveTripState(o.state))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return mine[0] ?? null;
}

/** Offers the rider can accept (open dispatch pool). */
export function selectOffers(orders: Order[]): Order[] {
  return orders
    .filter((o) => o.state === "ready_for_dispatch")
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/**
 * Derive the next action phase for the Active trip screen.
 *
 * COD is a hard gate: a COD order cannot complete delivery proof until cash
 * collection is recorded.
 */
export function tripPhase(order: Order | null): TripPhase {
  if (!order) return "idle";

  switch (order.state) {
    case "rider_assigned":
      return "pickup";
    case "picked_up":
      return "start_delivery";
    case "out_for_delivery":
      if (isCodOrder(order) && !isCodCollected(order)) {
        return "collect_cod";
      }
      return "delivery_proof";
    case "issue_window_open":
    case "delivered":
      return "complete";
    default:
      return "idle";
  }
}

/** Primary CTA copy for the current phase — verb says what will happen. */
export function primaryActionLabel(phase: TripPhase): string | null {
  switch (phase) {
    case "pickup":
      return "Confirm pickup";
    case "start_delivery":
      return "Start delivery";
    case "collect_cod":
      return "Record cash collection";
    case "delivery_proof":
      return "Confirm delivery";
    default:
      return null;
  }
}

/** Actor label for timeline rows. Never show raw user ids. */
export function timelineActorLabel(by: string, selfId?: string | null): string {
  if (selfId && by === selfId) return "You";
  if (by === "system") return "System";
  if (by === "user_rider") return "Rider";
  if (by === "user_supplier") return "Supplier";
  if (by === "user_client") return "Client";
  if (by === "user_ops" || by === "user_admin") return "Operations";
  if (by.startsWith("user_")) return "Team member";
  return "Team member";
}

/** Format a timeline timestamp for the list (local short form). */
export function formatTimelineAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Relative time for alert lists. */
export function formatRelativeAt(iso: string, nowMs: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const delta = Math.max(0, nowMs - t);
  const mins = Math.floor(delta / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Unread count for the Alerts tab badge. */
export function unreadCount(
  items: { read: boolean }[],
): number {
  return items.reduce((n, item) => n + (item.read ? 0 : 1), 0);
}

/**
 * Build the failure note body sent to the API.
 * The API stores a single `note` string — reason id is folded into plain language.
 */
export function buildFailureNote(reasonId: FailureReasonId, note: string): string {
  const reason = FAILURE_REASONS.find((r) => r.id === reasonId)?.label ?? "Other";
  const trimmed = note.trim();
  return trimmed ? `${reason}. ${trimmed}` : reason;
}

/** Interval between live location pings while a package is in transit. */
export const LOCATION_PING_INTERVAL_MS = 15_000;

/** Extract a LatLng from an API stop, or null when missing/invalid. */
export function stopLatLng(stop: OrderStop | null | undefined): LatLng | null {
  if (!stop) return null;
  const point = { lat: stop.lat, lng: stop.lng };
  return isValidLatLng(point) ? point : null;
}

/** Pickup label from API, with a plain fallback. */
export function pickupLabel(order: Pick<Order, "pickup" | "zone">): string {
  return order.pickup?.label?.trim() || "Supplier print shop";
}

/** Drop-off label from API / address field. */
export function dropoffLabel(order: Pick<Order, "dropoff" | "address">): string {
  return order.dropoff?.label?.trim() || order.address || "Client address";
}
