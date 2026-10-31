import type { Order } from "@/lib/api";
import { endsAtOffice, type TripPhase } from "@/lib/riderOrder";
import { HANDOVER_STEPS, ridersPack } from "@/lib/shopHandover";

/**
 * The whole job as the rider walks it, for the header on Active (#163).
 *
 * A reading of the trip phase and nothing more: the steps are the ones the
 * server already enforces, in its order, and a step is done only because the
 * phase has moved past it. Nothing here gates, skips or adds a step.
 *
 * A `rider_packs` counter is three recorded steps (`HANDOVER_STEPS`). A legacy
 * counter is one: the checks and the shop's signature go in one request, so
 * Active never sees them apart and drawing them apart would show a step that
 * could never be current.
 */

export type JobStepStatus = "done" | "now" | "held" | "upcoming";

export type JobStep = {
  key: "check" | "pack" | "sign" | "set_off" | "hand_over";
  label: string;
  status: JobStepStatus;
};

export type JobProgress = {
  steps: JobStep[];
  /** The line above the rail: "NEXT STEP · 2 OF 5", "ON HOLD", "ALL STEPS DONE". */
  overline: string;
  /** The step in words, or what the rider is waiting for. */
  title: string;
  pickupDone: boolean;
  dropoffDone: boolean;
};

type ProgressOrder = Pick<Order, "fulfillmentMode"> & Partial<Pick<Order, "handoverFlow">>;

/** Index of the step the phase is on; past the end once the job is closed. */
function currentIndex(phase: TripPhase, packs: boolean, total: number): number {
  switch (phase) {
    case "pickup_checks":
    case "pickup_blocked":
      return 0;
    case "pickup_pack":
      return 1;
    case "pickup_sign":
      return 2;
    case "start_delivery":
      return packs ? 3 : 1;
    case "delivery_proof":
      return total - 1;
    case "complete":
      return total;
    default:
      return -1;
  }
}

export function jobProgress(order: ProgressOrder, phase: TripPhase): JobProgress {
  const packs = ridersPack(order);
  const office = endsAtOffice(order);
  const labels: { key: JobStep["key"]; label: string }[] = [
    ...(packs
      ? HANDOVER_STEPS.map((item) => ({ key: item.step, label: item.label }))
      : [{ key: "check" as const, label: "Check and sign" }]),
    { key: "set_off", label: "Set off" },
    { key: "hand_over", label: office ? "Drop off" : "Hand over" },
  ];
  const index = currentIndex(phase, packs, labels.length);
  const held = phase === "pickup_blocked";

  const steps = labels.map(({ key, label }, i): JobStep => ({
    key,
    label,
    status: i < index ? "done" : i === index ? (held ? "held" : "now") : "upcoming",
  }));

  const overline = held
    ? "ON HOLD"
    : index >= labels.length
      ? "ALL STEPS DONE"
      : `NEXT STEP · ${Math.max(index, 0) + 1} OF ${labels.length}`;
  const title = held
    ? "Wait for Operations"
    : index >= labels.length
      ? office
        ? "Dropped off"
        : "Delivered"
      : labels[Math.max(index, 0)].label;

  return {
    steps,
    overline,
    title,
    pickupDone: phase === "start_delivery" || phase === "delivery_proof" || phase === "complete",
    dropoffDone: phase === "complete",
  };
}
