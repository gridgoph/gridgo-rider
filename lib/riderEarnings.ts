import type { Order } from "@/lib/api";
import { codAmountDueMinor, isCodOrder } from "@/lib/riderOrder";

/**
 * What a shift is worth, and what of GRIDGO's money is in the rider's pocket.
 *
 * Two numbers, and they are not the same kind of thing:
 *
 * - **Earned** is the rider's delivery fee on jobs they finished. It is theirs.
 * - **Cash to hand in** is customer money collected on delivery that has not
 *   been reconciled yet. It is not theirs, and a rider who confuses the two
 *   ends a day short. Nothing in this file ever adds them together.
 *
 * Everything is derived from the orders the API already returns for this rider,
 * because the demo backend has no payouts endpoint. The screen says so.
 */

/** Order states that mean the delivery happened and the fee is earned. */
export const DELIVERED_STATES = [
  "delivered",
  "issue_window_open",
  "completed",
  "payout_released",
] as const;

/** Payment statuses that mean the rider is still holding customer cash. */
const CASH_IN_HAND_STATUSES = new Set(["collected"]);

export type EarningsEntry = {
  orderId: string;
  title: string;
  /** Where it went, for recognising the job in a list. */
  dropoff: string;
  /** ISO timestamp of the delivery, best available from the order. */
  at: string;
  /** The rider's fee for this job, in centavos. */
  feeMinor: number;
  /** Customer cash the rider took at the door, in centavos. Zero when prepaid. */
  cashCollectedMinor: number;
  /** True while that cash has not been reconciled with Operations. */
  cashOutstanding: boolean;
};

export type EarningsSummary = {
  /** Fees for deliveries completed today, in centavos. */
  todayMinor: number;
  /** Number of deliveries completed today. */
  todayCount: number;
  /** Fees for every completed delivery this account has, in centavos. */
  allTimeMinor: number;
  /** Unreconciled customer cash the rider is carrying, in centavos. */
  cashToHandInMinor: number;
  /** Newest first. */
  entries: EarningsEntry[];
};

export function isDeliveredState(state: string): boolean {
  return (DELIVERED_STATES as readonly string[]).includes(state);
}

/** When the delivery actually landed, from the timeline where possible. */
export function deliveredAt(order: Order): string {
  const delivered = [...order.timeline]
    .reverse()
    .find((entry) => entry.state === "delivered" || entry.state === "issue_window_open");
  return delivered?.at ?? order.updatedAt;
}

/** Same calendar day in the phone's own timezone. */
export function isSameLocalDay(iso: string, nowMs: number): boolean {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return false;
  const now = new Date(nowMs);
  return (
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate()
  );
}

/**
 * Build the earnings view for one rider.
 *
 * Orders that are not this rider's, or that never reached a delivered state,
 * contribute nothing — an accepted job is not income.
 */
export function summariseEarnings(
  orders: Order[],
  riderId: string | null,
  nowMs: number = Date.now(),
): EarningsSummary {
  const entries: EarningsEntry[] = [];

  for (const order of orders) {
    if (!riderId || order.riderId !== riderId) continue;
    if (!isDeliveredState(order.state)) continue;

    const cash = isCodOrder(order) ? codAmountDueMinor(order) : 0;
    entries.push({
      orderId: order.id,
      title: order.title,
      dropoff: order.dropoff?.label?.trim() || order.address || "Client address",
      at: deliveredAt(order),
      feeMinor: order.deliveryFeeMinor,
      cashCollectedMinor: cash,
      cashOutstanding: cash > 0 && CASH_IN_HAND_STATUSES.has(order.paymentStatus),
    });
  }

  entries.sort((a, b) => (a.at < b.at ? 1 : -1));

  const today = entries.filter((entry) => isSameLocalDay(entry.at, nowMs));

  return {
    todayMinor: today.reduce((sum, entry) => sum + entry.feeMinor, 0),
    todayCount: today.length,
    allTimeMinor: entries.reduce((sum, entry) => sum + entry.feeMinor, 0),
    cashToHandInMinor: entries.reduce(
      (sum, entry) => sum + (entry.cashOutstanding ? entry.cashCollectedMinor : 0),
      0,
    ),
    entries,
  };
}

/** Short date for an earnings row: "Today", "Yesterday", or "8 Aug". */
export function earningsDayLabel(iso: string, nowMs: number = Date.now()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  if (isSameLocalDay(iso, nowMs)) return "Today";
  if (isSameLocalDay(iso, nowMs - 24 * 60 * 60 * 1000)) return "Yesterday";
  return then.toLocaleDateString("en-PH", { day: "numeric", month: "short" });
}
