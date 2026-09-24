import type { Order } from "@/lib/api";
import { formatPhp } from "@/lib/api";

/**
 * What the rider takes home from one job.
 *
 * The client pays one delivery fee and GRIDGO keeps a share of it
 * (`riderCommissionBps` is the rider's share, snapshotted on the order). The
 * API does the split and sends `riderPayoutMinor`; this app never recomputes
 * it, because rounding is the server's call. An API that predates the split
 * sends neither field, and then the whole fee is the rider's, as it always was.
 *
 * Contract: gridgo-api `docs/OPERATIONAL_MODEL_V2_API.md#rider-delivery-split`.
 */

export type RiderPay = {
  /** What the rider earns, in centavos. The number to lead with. */
  earnedMinor: number;
  /** The gross delivery fee the client pays, in centavos. */
  deliveryFeeMinor: number;
  /** Rider share in basis points when the API sent it, else null. */
  shareBps: number | null;
  /** GRIDGO keeps part of this fee, so the gross is worth showing beside it. */
  split: boolean;
};

type PayFields = Pick<Order, "deliveryFeeMinor" | "riderPayoutMinor" | "riderCommissionBps">;

function isMinorAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function riderPay(order: PayFields): RiderPay {
  const deliveryFeeMinor = order.deliveryFeeMinor;
  const payout = order.riderPayoutMinor;
  const bps = order.riderCommissionBps;
  const shareBps = isMinorAmount(bps) && bps <= 10_000 ? bps : null;

  // A payout above the gross is not a split this app can explain; show the fee.
  if (!isMinorAmount(payout) || payout > deliveryFeeMinor) {
    return { earnedMinor: deliveryFeeMinor, deliveryFeeMinor, shareBps: null, split: false };
  }
  return { earnedMinor: payout, deliveryFeeMinor, shareBps, split: payout < deliveryFeeMinor };
}

/** 8500 → "85%", 8750 → "87.5%". */
export function shareLabel(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

/**
 * The secondary line under an earning: "85% of the ₱25.00 delivery fee".
 * Null when the rider keeps the whole fee — there is nothing to explain.
 */
export function riderPayDetail(pay: RiderPay): string | null {
  if (!pay.split) return null;
  const fee = formatPhp(pay.deliveryFeeMinor);
  return pay.shareBps === null
    ? `Of the ${fee} delivery fee`
    : `${shareLabel(pay.shareBps)} of the ${fee} delivery fee`;
}

/** For screen readers: "you earn ₱21.25 of the ₱25.00 delivery fee". */
export function riderPayA11y(pay: RiderPay): string {
  const earned = formatPhp(pay.earnedMinor);
  return pay.split
    ? `${earned} of the ${formatPhp(pay.deliveryFeeMinor)} delivery fee`
    : earned;
}
