import type { TripPhase } from "@/lib/riderOrder";

/**
 * What the raised centre disc does right now.
 *
 * The disc is the app's one action, so it has to mean something at every point
 * in a shift — including the long stretches with no job in hand, where the
 * thing that moves a rider forward is finding one, and the stretch where a
 * failed pickup check has stopped the job dead, where the only honest move is
 * to go and read what Operations has said.
 *
 * `label` is short because it sits in a 10px nav label box under a 56px disc.
 * `spoken` is the full sentence a screen reader reads, because "Checks" on its
 * own tells a blind rider nothing.
 */
export type RiderActionKind =
  | "pickup-checks"
  | "on-hold"
  | "start-delivery"
  | "delivery-proof"
  | "find-work"
  | "not-accredited";

/** Which glyph the disc wears. Mapped to Lucide in the tab bar. */
export type RiderActionGlyph =
  | "checklist"
  | "hold"
  | "navigate"
  | "camera"
  | "search"
  | "waiting";

export type RiderAction = {
  kind: RiderActionKind;
  /** Glyph for the disc — it changes with the verb, so the two agree. */
  glyph: RiderActionGlyph;
  /** One short verb under the disc. */
  label: string;
  /** Full sentence for assistive technology. */
  spoken: string;
  /** Route the disc opens. Trip routes carry `?orderId=`. */
  route:
    | "/(tabs)/offers"
    | "/alerts"
    | "/trip/pickup"
    | "/trip/start"
    | "/trip/delivery";
  /** True when the route needs the order id appended. */
  needsOrderId: boolean;
};

const FIND_WORK: RiderAction = {
  kind: "find-work",
  glyph: "search",
  label: "Find work",
  spoken: "Find work. Opens the open offers.",
  route: "/(tabs)/offers",
  needsOrderId: false,
};

/**
 * An account Operations has not accredited cannot take a job, so the disc must
 * not offer to find one. It still goes somewhere useful: Offers is where the
 * review status and what is under it are explained.
 */
const NOT_ACCREDITED: RiderAction = {
  kind: "not-accredited",
  glyph: "waiting",
  label: "Not yet",
  spoken:
    "Operations has not accredited this account yet. Opens where your review status is explained.",
  route: "/(tabs)/offers",
  needsOrderId: false,
};

/**
 * Map the trip phase to the disc's action.
 *
 * With no job in hand the disc offers the only move that exists — take one.
 * It is never disabled: a permanently dead primary action is worse than one
 * that points at the obvious next thing. When transport is blocked, that next
 * thing is the trip screen, which is where the hold and its reason live.
 */
export function riderAction(
  phase: TripPhase,
  orderId: string | null,
  canWork = true,
): RiderAction {
  if (!canWork) return NOT_ACCREDITED;
  if (!orderId) return FIND_WORK;

  switch (phase) {
    case "pickup_checks":
      return {
        kind: "pickup-checks",
        glyph: "checklist",
        label: "Check it",
        spoken: "Run the six pickup checks before carrying the package.",
        route: "/trip/pickup",
        needsOrderId: true,
      };
    case "pickup_blocked":
      // Not the trip screen: the rider is usually already standing on it, and
      // a disc that reopens the screen you are looking at is a dead tap. What
      // they are actually waiting for is Operations' instruction, and that
      // arrives as an alert.
      return {
        kind: "on-hold",
        glyph: "hold",
        label: "On hold",
        spoken:
          "Transport is on hold after a failed check. Opens your alerts, where Operations' instruction lands.",
        route: "/alerts",
        needsOrderId: false,
      };
    case "start_delivery":
      return {
        kind: "start-delivery",
        glyph: "navigate",
        label: "Set off",
        spoken: "Set off for the client. Asks you to confirm first.",
        route: "/trip/start",
        needsOrderId: true,
      };
    case "delivery_proof":
      return {
        kind: "delivery-proof",
        glyph: "camera",
        label: "Hand over",
        spoken: "Hand the package over. Opens delivery proof.",
        route: "/trip/delivery",
        needsOrderId: true,
      };
    default:
      // complete, idle — the job is closed, so the next move is work.
      return FIND_WORK;
  }
}
