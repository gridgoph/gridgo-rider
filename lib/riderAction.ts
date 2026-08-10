import type { TripPhase } from "@/lib/riderOrder";

/**
 * What the raised centre disc does right now.
 *
 * The disc is the app's one action, so it has to mean something at every point
 * in a shift — including the long stretches with no job in hand, where the
 * thing that moves a rider forward is finding one.
 *
 * `label` is short because it sits in a 10px nav label box under a 56px disc.
 * `spoken` is the full sentence a screen reader reads, because "Proof" on its
 * own tells a blind rider nothing.
 */
export type RiderActionKind =
  | "pickup"
  | "start-delivery"
  | "collect-cash"
  | "delivery-proof"
  | "hand-back"
  | "find-work";

/** Which glyph the disc wears. Mapped to Lucide in the tab bar. */
export type RiderActionGlyph = "package" | "navigate" | "cash" | "camera" | "undo" | "search";

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
    | "/trip/pickup"
    | "/trip/start"
    | "/trip/cod"
    | "/trip/delivery"
    | "/trip/handback";
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
 * Map the trip phase to the disc's action.
 *
 * With no job in hand the disc offers the only move that exists — take one.
 * It is never disabled: a permanently dead primary action is worse than one
 * that points at the obvious next thing.
 */
export function riderAction(phase: TripPhase, orderId: string | null): RiderAction {
  if (!orderId) return FIND_WORK;

  switch (phase) {
    case "pickup":
      return {
        kind: "pickup",
        glyph: "package",
        label: "Pick up",
        spoken: "Collect the package. Opens pickup proof.",
        route: "/trip/pickup",
        needsOrderId: true,
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
    case "collect_cod":
      return {
        kind: "collect-cash",
        glyph: "cash",
        label: "Take cash",
        spoken: "Take the cash from the client. Opens cash collection.",
        route: "/trip/cod",
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
    case "returning":
      return {
        kind: "hand-back",
        glyph: "undo",
        label: "Return it",
        spoken: "Return the package to the shop. Asks you to confirm first.",
        route: "/trip/handback",
        needsOrderId: true,
      };
    default:
      // returned, complete, idle — the job is closed, so the next move is work.
      return FIND_WORK;
  }
}
