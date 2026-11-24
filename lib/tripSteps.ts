import type { DeliveryMilestone, Order } from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { cashAmountsOf, type CashStage } from "@/lib/cash";
import { endsAtOffice, type TripPhase } from "@/lib/riderOrder";
import { receiverWord } from "@/lib/groupOrder";

/**
 * The trip as four steps on the map: to the shop, the check there, to the
 * client, and the handover (gridgo-api `docs/RIDER_MAP_HOME_API.md`, "Four app
 * steps, existing server gates").
 *
 * A reading of the existing phase ladder (`tripPhase`) and the rider's own
 * milestones — never a second state machine. Every gate is still the
 * server's: the checklist, the packed photo, the shop's signature, the
 * transition out for delivery, and delivery evidence. This only says which of
 * the four the rider is on and what the one button on the map does next.
 */

export type TripStepKey = "to_shop" | "check" | "to_client" | "hand_over";

export const TRIP_STEPS: readonly { key: TripStepKey; label: string }[] = [
  { key: "to_shop", label: "To shop" },
  { key: "check", label: "Check" },
  { key: "to_client", label: "To client" },
  { key: "hand_over", label: "Hand over" },
];

export type TripStepStatus = "done" | "now" | "held" | "upcoming";

/** Arrivals the rider tapped on this phone, for jobs the server records none for. */
export type LocalArrivals = { shop: boolean; destination: boolean };

const NO_LOCAL: LocalArrivals = { shop: false, destination: false };

function milestoneDone(milestones: DeliveryMilestone[] | undefined, code: DeliveryMilestone["code"]): boolean {
  const found = milestones?.find((milestone) => milestone.code === code);
  return found?.status === "completed" || found?.status === "passed";
}

/** Whether the server has the rider at the shop for this assignment. */
export function atShopRecorded(order: Pick<Order, "deliveryMilestones">): boolean {
  return milestoneDone(order.deliveryMilestones, "at_shop");
}

/** Whether the server has the rider at the client's door for this assignment. */
export function arrivedRecorded(order: Pick<Order, "deliveryMilestones">): boolean {
  return milestoneDone(order.deliveryMilestones, "arrived");
}

/**
 * Which step the rider is on, `done` once the job has left their hands, or
 * null with no job.
 */
export function currentTripStep(
  order: Order | null,
  phase: TripPhase,
  local: LocalArrivals = NO_LOCAL,
): TripStepKey | "done" | null {
  if (!order || phase === "idle") return null;
  switch (phase) {
    case "pickup_checks": {
      // A checklist record (a resolved escalation, say) means the counter has
      // already been reached once on this assignment.
      const started = Boolean(order.pickupChecklist) || atShopRecorded(order) || local.shop;
      return started ? "check" : "to_shop";
    }
    case "pickup_pack":
    case "pickup_sign":
    case "pickup_blocked":
      return "check";
    case "start_delivery":
      return "to_client";
    case "delivery_proof":
      return arrivedRecorded(order) || local.destination ? "hand_over" : "to_client";
    case "complete":
      return "done";
    default:
      return null;
  }
}

export type TripRailStep = { key: TripStepKey; label: string; status: TripStepStatus };

export function tripRail(step: TripStepKey | "done" | null, held = false): TripRailStep[] {
  const index = step === "done" ? TRIP_STEPS.length : step ? TRIP_STEPS.findIndex((s) => s.key === step) : -1;
  return TRIP_STEPS.map((s, i) => ({
    ...s,
    status: i < index ? "done" : i === index ? (held ? "held" : "now") : "upcoming",
  }));
}

/**
 * What the map's one button does.
 *
 * `arrive_shop` and `arrive_destination` record where the rider is (a door
 * delivery tells the shop or the client; a GRIDGO Office job has no such
 * record, so this phone remembers it) and move the rail on. `open` pushes the
 * existing proof screen for the step, which is where every server gate lives.
 * `none` is a hold: nothing the rider can tap moves this job.
 */
export type TripStepAction =
  | { kind: "arrive_shop"; label: string }
  | { kind: "arrive_destination"; label: string; then: "/trip/delivery" }
  | {
      kind: "open";
      label: string;
      route: "/trip/pickup" | "/trip/pack" | "/trip/handoff" | "/trip/start" | "/trip/delivery" | "/trip/shop-payment";
    }
  | { kind: "none" };

export function tripStepAction(
  order: Order,
  phase: TripPhase,
  step: TripStepKey | "done" | null,
  cash: CashStage = "none",
): TripStepAction {
  const office = endsAtOffice(order);
  switch (step) {
    case "to_shop":
      return { kind: "arrive_shop", label: "I'm at the shop" };
    case "check":
      // A cash job pays the shop first: the server refuses the checks until it has the receipt.
      if (cash === "pay_shop" && phase === "pickup_checks") {
        return { kind: "open", label: "Pay the shop", route: "/trip/shop-payment" };
      }
      if (phase === "pickup_pack") return { kind: "open", label: "Photograph the packed job", route: "/trip/pack" };
      if (phase === "pickup_sign") return { kind: "open", label: "Shop signs the handoff", route: "/trip/handoff" };
      if (phase === "pickup_checks") return { kind: "open", label: "Start the shop check", route: "/trip/pickup" };
      return { kind: "none" };
    case "to_client":
      if (phase === "start_delivery") return { kind: "open", label: "Start delivery", route: "/trip/start" };
      return {
        kind: "arrive_destination",
        label: office ? "I'm at GRIDGO Office" : "I'm at the client",
        then: "/trip/delivery",
      };
    case "hand_over":
      if (cash === "carry" && !office) return { kind: "open", label: "Collect cash and sign", route: "/trip/delivery" };
      return { kind: "open", label: office ? "Drop it off" : "Hand over and sign", route: "/trip/delivery" };
    default:
      return { kind: "none" };
  }
}

/** One line under the step, saying what happens there. */
export function tripStepNote(
  order: Order,
  phase: TripPhase,
  step: TripStepKey | "done" | null,
  cash: CashStage = "none",
): string | null {
  const office = endsAtOffice(order);
  const amounts = cashAmountsOf(order);
  // A group order is handed to its host, who pays any cash for the whole group.
  const who = receiverWord(order);
  if (cash === "returned") return "Back at GRIDGO Office. Your shop payment is back in your wallet.";
  if (cash === "pay_shop" && step === "check" && phase === "pickup_checks") {
    return amounts
      ? `Pay the shop exactly ${formatPhp(amounts.shopMinor)} in cash and photograph its receipt. Then check the job.`
      : "Pay the shop its exact price in cash and photograph its receipt. Then check the job.";
  }
  if (cash === "carry" && step === "to_client" && !office && amounts) {
    return who === "host"
      ? `Ride to the host. They pay exactly ${formatPhp(amounts.collectMinor)} in cash for the whole group.`
      : `Ride to the client. At the door you collect exactly ${formatPhp(amounts.collectMinor)} in cash.`;
  }
  if (cash === "carry" && step === "hand_over" && !office) {
    return amounts
      ? `Collect exactly ${formatPhp(amounts.collectMinor)} in cash${who === "host" ? " from the host, for the whole group" : ""}. Then the ${who} signs the receipt on your phone.`
      : `Collect the ${who}'s exact total in cash. Then they sign the receipt on your phone.`;
  }
  switch (step) {
    case "to_shop":
      return "Ride to the shop. Tap the button when you reach the counter.";
    case "check":
      if (phase === "pickup_blocked") {
        return "A check failed and Operations has it. Leave the package at the shop and wait for their alert.";
      }
      if (phase === "pickup_pack") return "Your check is recorded. Watch the shop pack it, then photograph it.";
      if (phase === "pickup_sign") return "The packed photo is saved. The shop signs on your phone next.";
      return "Count and check every piece with the shop before pick-up unlocks.";
    case "to_client":
      if (phase === "start_delivery") return "The package is yours. Start the delivery when you ride.";
      return office ? "Ride to GRIDGO Office." : `Ride to the ${who}. Tap the button at their door.`;
    case "hand_over":
      return office
        ? "Leave it on the GRIDGO shelf and photograph it there."
        : who === "host"
          ? "Hand everything to the host. Take the door photo and have them sign the receipt on your phone."
          : "Take the door photo and have the receiving person sign the receipt on your phone.";
    case "done":
      return office ? "Dropped off at GRIDGO Office." : "Delivered.";
    default:
      return null;
  }
}
