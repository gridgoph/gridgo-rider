import type { Order } from "@/lib/api";
import {
  dropoffLabel,
  isActiveTripState,
  orderStateLabel,
  pickupLabel,
  sortTimelineNewestFirst,
} from "@/lib/riderOrder";

/**
 * Jobs this rider already accepted that are no longer the trip in hand.
 *
 * Earnings only counts delivered fees. This list is the ledger: completed,
 * left at the office, and cancelled — whatever the API still assigns to them.
 * Open offers and other riders' live trips stay out; GET /orders also returns
 * those for approved accounts.
 */

export type PastJobEntry = {
  orderId: string;
  title: string;
  pickup: string;
  dropoff: string;
  /** When this job last moved, newest event on the trail. */
  at: string;
  feeMinor: number;
  state: string;
  statusLabel: string;
};

/** This rider accepted the job. Offers and someone else's trip are not theirs. */
export function isAcceptedJob(order: Pick<Order, "riderId">, riderId: string | null): boolean {
  return Boolean(riderId && order.riderId === riderId);
}

/** Accepted, and no longer the live Active trip. */
export function isPastJob(order: Pick<Order, "riderId" | "state">, riderId: string | null): boolean {
  return isAcceptedJob(order, riderId) && !isActiveTripState(order.state);
}

/** Last movement on the trail — when the rider last heard the job change. */
export function pastJobAt(order: Pick<Order, "timeline" | "updatedAt">): string {
  const latest = sortTimelineNewestFirst(order.timeline)[0];
  return latest?.at ?? order.updatedAt;
}

/**
 * Past accepted jobs, newest movement first.
 *
 * Cancelled and incomplete stay in. Hiding a failed job would make the ledger
 * look cleaner than the work was.
 */
export function listPastJobs(orders: Order[], riderId: string | null): PastJobEntry[] {
  const entries: PastJobEntry[] = [];

  for (const order of orders) {
    if (!isPastJob(order, riderId)) continue;
    entries.push({
      orderId: order.id,
      title: order.title,
      pickup: pickupLabel(order),
      dropoff: dropoffLabel(order),
      at: pastJobAt(order),
      feeMinor: order.deliveryFeeMinor,
      state: order.state,
      statusLabel: orderStateLabel(order.state),
    });
  }

  entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return entries;
}
