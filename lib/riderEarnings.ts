import type { Order } from "@/lib/api";
import { riderPay, riderPayDetail } from "@/lib/riderPay";

/**
 * What a shift is worth.
 *
 * Until v2 there were two numbers here and the whole file existed to keep them
 * apart: the rider's fees, and the customer cash they were carrying. Cash on
 * delivery is gone — the captain removed it precisely so that a rider never
 * holds the client's money — so there is one number left, and it is theirs.
 *
 * Everything is derived from the orders the API already returns for this rider,
 * because the demo backend has no payouts endpoint. The screen says so. That
 * number is the rider's share of each delivery fee (`riderPay`), not the gross
 * the client paid — GRIDGO keeps the rest.
 */

/** Order states that mean the delivery happened and the fee is earned. */
export const DELIVERED_STATES = [
  "delivered",
  "issue_window_open",
  "completed",
  "payout_released",
] as const;

export type EarningsEntry = {
  orderId: string;
  title: string;
  /** Where it went, for recognising the job in a list. */
  dropoff: string;
  /** ISO timestamp of the delivery, best available from the order. */
  at: string;
  /** What the rider earned for this job — their share of the fee — in centavos. */
  feeMinor: number;
  /** The gross delivery fee the client paid, in centavos. */
  deliveryFeeMinor: number;
  /** "85% of the ₱25.00 delivery fee", or null when the rider kept it all. */
  detail: string | null;
};

export type EarningsSummary = {
  /** Earnings from deliveries completed today, in centavos. */
  todayMinor: number;
  /** Number of deliveries completed today. */
  todayCount: number;
  /** Earnings from every completed delivery this account has, in centavos. */
  allTimeMinor: number;
  /** GRIDGO kept a share of at least one fee, so the footnote says so. */
  split: boolean;
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

    const pay = riderPay(order);
    entries.push({
      orderId: order.id,
      title: order.title,
      dropoff: order.dropoff?.label?.trim() || order.address || "Client address",
      at: deliveredAt(order),
      feeMinor: pay.earnedMinor,
      deliveryFeeMinor: pay.deliveryFeeMinor,
      detail: riderPayDetail(pay),
    });
  }

  entries.sort((a, b) => (a.at < b.at ? 1 : -1));

  const today = entries.filter((entry) => isSameLocalDay(entry.at, nowMs));

  return {
    todayMinor: today.reduce((sum, entry) => sum + entry.feeMinor, 0),
    todayCount: today.length,
    allTimeMinor: entries.reduce((sum, entry) => sum + entry.feeMinor, 0),
    split: entries.some((entry) => entry.detail !== null),
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
