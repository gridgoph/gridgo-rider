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
  | "pickup_checks"
  | "pickup_blocked"
  | "start_delivery"
  | "delivery_proof"
  | "complete"
  | "idle";

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
    case "awaiting_collection":
      return "Left at GRIDGO Office";
    case "delivered":
      return "Delivered";
    case "issue_window_open":
      return "Delivery complete";
    case "completed":
      return "Closed";
    case "payout_released":
      return "Settled";
    case "cancelled":
      return "Cancelled";
    default:
      return "In progress";
  }
}

/**
 * Status chip for the job in hand. Always icon + label + tone.
 *
 * Reads the checklist as well as the state, because a blocked pickup and a
 * pickup about to happen are the same server state and could not be more
 * different to the rider standing there.
 */
export function orderStateChip(order: Pick<Order, "state" | "pickupChecklist">): {
  label: string;
  tone: "success" | "warning" | "error" | "info" | "neutral";
  icon: "circle-check" | "triangle-alert" | "circle-x" | "clock" | "square-pen";
} {
  if (order.state === "rider_assigned" && isTransportBlocked(order)) {
    return { label: "Do not transport", tone: "error", icon: "circle-x" };
  }
  if (order.state === "rider_assigned" && order.pickupChecklist?.status === "escalation_resolved") {
    return { label: "Check it again", tone: "warning", icon: "triangle-alert" };
  }

  switch (order.state) {
    case "ready_for_dispatch":
      return { label: "Ready for pickup", tone: "info", icon: "clock" };
    case "rider_assigned":
      // Heading to the shop is the normal next step, not a risk. A warning tone
      // here would spend an alarm on a job going exactly to plan.
      return { label: "Check before you carry", tone: "info", icon: "clock" };
    case "picked_up":
      return { label: "Package with you", tone: "info", icon: "circle-check" };
    case "out_for_delivery":
      return { label: "Out for delivery", tone: "info", icon: "clock" };
    case "awaiting_collection":
      return { label: "Left at GRIDGO Office", tone: "success", icon: "circle-check" };
    case "issue_window_open":
    case "delivered":
    case "completed":
      return { label: "Delivery complete", tone: "success", icon: "circle-check" };
    case "cancelled":
      return { label: "Cancelled", tone: "error", icon: "circle-x" };
    default:
      return { label: orderStateLabel(order.state), tone: "neutral", icon: "clock" };
  }
}

/** Human zone name for a zone code. */
export function zoneLabel(zone: string): string {
  if (!zone) return "Zone unknown";
  return ZONE_LABELS[zone] ?? zone.replaceAll("_", " ");
}

/**
 * Whether the client's final 25% has been confirmed by Operations.
 *
 * The server refuses to record a delivery until it has, so the rider is told
 * before they knock rather than after they have handed the package over. The
 * amount is deliberately not part of this: no money changes hands at the door
 * any more, so a peso figure here would only invite a rider to ask for it.
 */
/**
 * Whether this job ends on GRIDGO's own counter rather than in someone's hands.
 *
 * A collected job still travels — the client fetches it from GRIDGO Office, so
 * a rider carries it there from the shop. The difference is the ending: nobody
 * receives it at the far end, so nothing about the client's money is the
 * rider's business. Operations settles that at the counter, whenever the client
 * comes for it.
 */
export function endsAtOffice(order: Pick<Order, "fulfillmentMode">): boolean {
  return order.fulfillmentMode === "pickup";
}

export function isBalanceConfirmed(order: Pick<Order, "payments">): boolean {
  const status = order.payments?.balance?.status;
  return status === "confirmed" || status === "legacy_confirmed";
}

/** True once the six checks have passed and the package may be carried. */
export function isPickupCleared(order: Pick<Order, "pickupChecklist">): boolean {
  const status = order.pickupChecklist?.status;
  return status === "passed" || status === "legacy_passed";
}

/** True while a failed check is with Operations and nothing may move. */
export function isTransportBlocked(order: Pick<Order, "pickupChecklist">): boolean {
  return order.pickupChecklist?.status === "failed_escalated";
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
 * The pickup checklist is the hard gate at the top of the ladder: while a
 * failed check is open with Operations the job has no next step at all, and
 * offering one would be the app inviting a rider to carry a package the
 * business has just refused.
 *
 * The verbal sign-off is deliberately not a phase. It is something the rider
 * says to the supplier and nothing on the server records it, so a phase waiting
 * on it would be a step only this phone could ever clear. It is surfaced
 * instead as standing instruction for exactly as long as it is owed — from the
 * checks passing until the rider leaves the shop — see `owesSignOff`.
 */
export function tripPhase(order: Order | null): TripPhase {
  if (!order) return "idle";

  switch (order.state) {
    case "rider_assigned":
      return isTransportBlocked(order) ? "pickup_blocked" : "pickup_checks";
    case "picked_up":
      return "start_delivery";
    case "out_for_delivery":
      return "delivery_proof";
    // A collected job leaves the rider here: it is on GRIDGO's shelf and the
    // client fetches it in their own time. Nothing further is theirs to do.
    case "awaiting_collection":
    case "issue_window_open":
    case "delivered":
    case "completed":
      return "complete";
    default:
      return "idle";
  }
}

/** Primary CTA copy for the current phase — verb says what will happen. */
export function primaryActionLabel(phase: TripPhase, toOffice = false): string | null {
  switch (phase) {
    case "pickup_checks":
      return "Run the six pickup checks";
    case "pickup_blocked":
      return null;
    case "start_delivery":
      return "Start delivery";
    case "delivery_proof":
      return toOffice ? "Confirm drop-off" : "Confirm delivery";
    default:
      return null;
  }
}

/** The stop the rider is heading to right now. Drives the map and the labels. */
export function activeStopKind(phase: TripPhase): "pickup" | "dropoff" | null {
  switch (phase) {
    case "pickup_checks":
    case "pickup_blocked":
      return "pickup";
    case "start_delivery":
    case "delivery_proof":
      return "dropoff";
    default:
      return null;
  }
}

/**
 * Whether the rider still owes the supplier the spoken sign-off.
 *
 * True from the checks passing until the package leaves the shop. Once the
 * rider is out for delivery the moment has gone, and a card still asking for it
 * would be the app nagging about something it cannot know either way.
 */
export function owesSignOff(order: Pick<Order, "state" | "pickupChecklist">): boolean {
  return order.state === "picked_up" && order.pickupChecklist?.status === "passed";
}

/** The trained line, from the server's own record. Never hard-coded here. */
export function signOffPrompt(order: Pick<Order, "pickupChecklist">): string | null {
  return order.pickupChecklist?.signOffPrompt?.trim() || null;
}

/**
 * The distance the delivery fee was banded from, in words.
 *
 * The fee is no longer a flat zone rate, so "₱25" on its own now looks
 * arbitrary. Saying what it was measured over is what makes it read as a rate
 * rather than a number someone picked. This is the API's straight-line figure,
 * not the road distance the map draws — so it is labelled as the distance the
 * fee is set from, and never presented as how far the rider will ride.
 */
export function feeDistanceLabel(metres: number | null | undefined): string | null {
  if (metres == null || !Number.isFinite(metres) || metres < 0) return null;
  if (metres < 1000) return `${Math.round(metres / 100) * 100} m apart`;
  return `${(metres / 1000).toFixed(1)} km apart`;
}

/** How long the client has to raise an issue, said the way a rider reads it. */
export function issueWindowLabel(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours) || hours <= 0) return "a short while";
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? "24 hours" : `${days} days`;
  }
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/**
 * Newest event first, by timestamp.
 *
 * The API stores oldest-first. A live trip log has to open on the current
 * status, so we sort here rather than trusting array order. Equal times keep
 * the later original index first (the API appends, so that index is newer).
 */
export function sortTimelineNewestFirst<T extends { at: string }>(
  timeline: readonly T[],
): T[] {
  return timeline
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const ta = Date.parse(a.entry.at);
      const tb = Date.parse(b.entry.at);
      const aOk = !Number.isNaN(ta);
      const bOk = !Number.isNaN(tb);
      if (aOk && bOk && ta !== tb) return tb - ta;
      if (aOk !== bOk) return aOk ? -1 : 1;
      return b.index - a.index;
    })
    .map(({ entry }) => entry);
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

/**
 * Date and time for an alert, e.g. "10 Aug 2026 · 3:24 PM".
 *
 * Alerts get the absolute stamp rather than "2h ago". A rider reading back
 * through them is usually settling when something happened — which shift, which
 * drop — and a relative age cannot answer that once the day has moved on.
 */
export function formatAlertAt(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const date = at.toLocaleDateString("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = at.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}

/** Relative time for compact lists. */
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
