import type { Order } from "@/lib/api";
import { isTransportBlocked } from "@/lib/riderOrder";

/**
 * Where a job actually is, as four steps a rider can point at.
 *
 * An alert that says "Dispatch available" and nothing else leaves the rider to
 * work out whether that job is the one in their top box. Showing the stage on
 * the alert answers that in a glance, which is what the legacy GRIDGO app got
 * right and what this reproduces.
 *
 * The stages are the rider's own, not the order's whole life. A client's
 * notification sensibly starts at "Order" and passes through "Printing"; a
 * rider never sees a job before it is ready for collection, and printing is not
 * a thing they can do anything about. So the ladder is the one their app
 * already walks — assigned, checked, carried, delivered.
 *
 * The stage is derived from the order itself, never from the notification's
 * wording. A message is a thing that was true when it was sent; the order is
 * where the job is now, which is the question being asked.
 */

export type OrderStageCode = "assigned" | "checked" | "on_the_way" | "delivered";

export type OrderStageDefinition = {
  code: OrderStageCode;
  /** Short enough to sit under a 32dp disc on the narrowest phone. */
  label: string;
  /** Read aloud in place of the label, which is too terse on its own. */
  spoken: string;
};

export const ORDER_STAGES: readonly OrderStageDefinition[] = [
  { code: "assigned", label: "Assigned", spoken: "Assigned to you" },
  { code: "checked", label: "Checked", spoken: "Pickup checks passed" },
  { code: "on_the_way", label: "On the way", spoken: "Out for delivery" },
  { code: "delivered", label: "Delivered", spoken: "Delivered" },
] as const;

export type OrderStage = {
  /** Index into `ORDER_STAGES`, or -1 before the job reaches a rider at all. */
  index: number;
  /**
   * True when a failed pickup check has stopped the job. The bar must not read
   * as a job quietly progressing when the business has refused to move it.
   */
  blocked: boolean;
  /** One line naming where the job is, for the card and for screen readers. */
  summary: string;
};

/** Rider-ladder index for a server state, or -1 before the job reaches them. */
function stageIndexForState(state: string): number {
  switch (state) {
    case "rider_assigned":
      return 0;
    case "picked_up":
      return 1;
    case "out_for_delivery":
      return 2;
    case "awaiting_collection":
    case "delivered":
    case "issue_window_open":
    case "completed":
    case "payout_released":
      return 3;
    default:
      return -1;
  }
}

/** Where this job stands, in rider terms. */
export function orderStage(
  order: Pick<Order, "state" | "pickupChecklist"> & {
    timeline?: { state: string }[];
  },
): OrderStage {
  if (order.state === "cancelled") {
    const prior = [...(order.timeline ?? [])]
      .reverse()
      .find((entry) => entry.state !== "cancelled");
    return {
      index: prior ? stageIndexForState(prior.state) : -1,
      blocked: true,
      summary: "Cancelled",
    };
  }

  if (isTransportBlocked(order)) {
    return {
      index: 0,
      blocked: true,
      summary: "Held at the shop after a failed check",
    };
  }

  switch (order.state) {
    case "rider_assigned":
      return { index: 0, blocked: false, summary: "Go to the shop for joint pickup checks" };
    case "picked_up":
      return { index: 1, blocked: false, summary: "Checked, and with you" };
    case "out_for_delivery":
      return { index: 2, blocked: false, summary: "On the way to the client" };
    case "awaiting_collection":
      return { index: 3, blocked: false, summary: "Left at GRIDGO Office" };
    case "delivered":
    case "issue_window_open":
    case "completed":
    case "payout_released":
      return { index: 3, blocked: false, summary: "Delivered" };
    case "ready_for_dispatch":
      return { index: -1, blocked: false, summary: "Open for any rider to take" };
    default:
      // Still at the supplier, or somewhere no rider acts. Saying "assigned"
      // here would be the bar inventing a step that has not happened.
      return { index: -1, blocked: false, summary: "Not with a rider yet" };
  }
}

/** How one step should be drawn, given where the job is. */
export type StageState = "done" | "current" | "blocked" | "upcoming";

export function stageState(stageIndex: number, progress: OrderStage): StageState {
  if (stageIndex > progress.index) return "upcoming";
  if (stageIndex < progress.index) return "done";
  return progress.blocked ? "blocked" : "current";
}
