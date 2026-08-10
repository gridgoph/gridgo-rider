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
  | "returning"
  | "returned"
  | "complete"
  | "idle";

/**
 * Failure reasons the rider can record.
 *
 * The id is what the API stores; the label is what the rider reads. `retryable`
 * seeds the follow-up choice — nobody home is worth a second attempt, a wrong
 * address is not — but the rider always makes the final call.
 */
export const FAILURE_REASONS = [
  {
    id: "unavailable",
    label: "Nobody at the address",
    helper: "You arrived, nobody came to the door or answered the phone.",
    retryable: true,
  },
  {
    id: "wrong_address",
    label: "Address is wrong or incomplete",
    helper: "The address does not exist, or it is missing a unit or landmark.",
    retryable: false,
  },
  {
    id: "refused",
    label: "Client refused the package",
    helper: "Someone was there and would not take it.",
    retryable: false,
  },
  {
    id: "access",
    label: "Could not get in",
    helper: "A gate, guard, or closed building stopped you reaching the door.",
    retryable: true,
  },
  {
    id: "other",
    label: "Something else",
    helper: "Anything the four reasons above do not cover. Add a note.",
    retryable: true,
  },
] as const;

export type FailureReasonId = (typeof FAILURE_REASONS)[number]["id"];

export function failureReason(id: FailureReasonId) {
  return FAILURE_REASONS.find((r) => r.id === id) ?? FAILURE_REASONS[4];
}

/** What the rider does with the package after a failed attempt. */
export type FailureOutcome = "retry" | "return";

/** Outcome the reason suggests. The rider can still choose the other one. */
export function suggestedOutcome(id: FailureReasonId): FailureOutcome {
  return failureReason(id).retryable ? "retry" : "return";
}

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
      // Heading to the shop is the normal next step, not a risk. A warning tone
      // here would spend an alarm on a job going exactly to plan.
      return { label: "Head to pickup", tone: "info", icon: "clock" };
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
 * What the rider recorded on this device after a failed attempt.
 *
 * The demo API stores a failure proof but exposes no state for it, so the
 * follow-up the rider chose lives here. Screens must label it as recorded on
 * this phone rather than presenting it as the job's server state.
 */
export type TripExceptionSummary = {
  attemptCount: number;
  outcome: FailureOutcome | null;
  /** ISO time the rider recorded handing the package back, if they did. */
  returnedAt: string | null;
};

/**
 * Derive the next action phase for the Active trip screen.
 *
 * COD is a hard gate: a COD order cannot complete delivery proof until cash
 * collection is recorded. A recorded return outranks both — a package on its
 * way back to the shop is not a delivery waiting to be confirmed.
 */
export function tripPhase(
  order: Order | null,
  exception?: TripExceptionSummary | null,
): TripPhase {
  if (!order) return "idle";

  switch (order.state) {
    case "rider_assigned":
      return "pickup";
    case "picked_up":
      return "start_delivery";
    case "out_for_delivery":
      if (exception?.returnedAt) return "returned";
      if (exception?.outcome === "return") return "returning";
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
    case "returning":
      return "Confirm handover to supplier";
    default:
      return null;
  }
}

/** The stop the rider is heading to right now. Drives the map and the labels. */
export function activeStopKind(phase: TripPhase): "pickup" | "dropoff" | null {
  switch (phase) {
    case "pickup":
      return "pickup";
    case "start_delivery":
    case "collect_cod":
    case "delivery_proof":
      return "dropoff";
    case "returning":
      // Back to the shop the job came from.
      return "pickup";
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

export type FailureReport = {
  reasonId: FailureReasonId;
  outcome: FailureOutcome;
  /** Optional free text — the one field here that genuinely is free text. */
  note?: string;
  /** Chosen with a date/time picker, only when the outcome is another attempt. */
  nextAttemptAt?: Date | null;
  /** Whether the rider reached the client by phone before giving up. */
  contacted?: boolean;
};

/** Local short form for a planned next attempt, e.g. "10 Aug, 3:00 PM". */
export function formatAttemptAt(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Build the failure note body sent to the API.
 *
 * The API stores one `note` string per proof, so everything needed to settle a
 * dispute later — what happened, whether the client was reached, what the rider
 * did with the package, when they will try again — is folded into plain
 * language here. No ids, no snake_case: a person reads this.
 */
export function buildFailureNote(report: FailureReport): string {
  const parts: string[] = [failureReason(report.reasonId).label];

  if (report.contacted === true) parts.push("Client reached by phone");
  if (report.contacted === false) parts.push("Client did not answer the phone");

  if (report.outcome === "return") {
    parts.push("Package returned to the supplier");
  } else if (report.nextAttemptAt && !Number.isNaN(report.nextAttemptAt.getTime())) {
    parts.push(`Trying again ${formatAttemptAt(report.nextAttemptAt)}`);
  } else {
    parts.push("Rider is trying again");
  }

  const trimmed = (report.note ?? "").trim();
  if (trimmed) parts.push(trimmed);

  return `${parts.join(". ")}`.replace(/\.\.$/, ".");
}

/**
 * What the rider is committing to, said on the button and above it.
 *
 * There is no confirmation dialog behind this on purpose. The rider has just
 * chosen a reason, taken a photo and picked what happens to the package; a
 * modal asking the same question again is a step, not a safeguard. Instead the
 * button names the exact outcome and the line above it names the consequence,
 * which is the same information without the interruption. Nothing here is
 * irreversible either way — Active offers "the client can take it after all"
 * for as long as the package is with the rider.
 */
export function failureOutcomeCommit(
  outcome: FailureOutcome,
  supplierLabel: string,
  nextAttemptAt?: Date | null,
): { label: string; consequence: string } {
  if (outcome === "return") {
    return {
      label: "Record it and take the package back",
      consequence: `The client does not get it today. Operations reschedules the delivery once ${supplierLabel} has the package again.`,
    };
  }

  const when =
    nextAttemptAt && !Number.isNaN(nextAttemptAt.getTime())
      ? formatAttemptAt(nextAttemptAt)
      : null;

  return {
    label: when ? `Record it and try again ${when}` : "Record it and try again later",
    consequence: when
      ? `The job stays with you. The client and Operations see this attempt and that you are coming back ${when}.`
      : "The job stays with you. The client and Operations see this attempt.",
  };
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
