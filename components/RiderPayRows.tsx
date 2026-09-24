import { EarningAmount } from "@/components/EarningAmount";
import { SpecRow } from "@/components/SpecRow";
import type { Order } from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { riderPay, shareLabel } from "@/lib/riderPay";

type Props = {
  order: Pick<Order, "deliveryFeeMinor" | "riderPayoutMinor" | "riderCommissionBps">;
  /** "You earn" on a live trip; past and cancelled jobs say it in their own tense. */
  label: string;
  /** Drop the hairline under the final row, as `SpecRow` does. */
  last?: boolean;
  /** Mark the share as earned (`EarningAmount`). A cancelled job was not paid, so it passes false. */
  marked?: boolean;
};

/**
 * The money lines of a job's spec list, read like a receipt: the delivery fee,
 * then the rider's share of it as the bottom line. When the rider keeps the
 * whole fee (older orders, or an API without the split) there is one line.
 * Only the share carries the earnings mark; the gross is the client's money.
 */
export function RiderPayRows({ order, label, last = false, marked = true }: Props) {
  const pay = riderPay(order);
  const earned = marked ? (
    <EarningAmount minor={pay.earnedMinor} size="body" />
  ) : (
    formatPhp(pay.earnedMinor)
  );

  if (!pay.split) {
    return <SpecRow label={label} value={earned} last={last} />;
  }
  return (
    <>
      <SpecRow label="Delivery fee" value={formatPhp(pay.deliveryFeeMinor)} />
      <SpecRow
        label={pay.shareBps === null ? label : `${label} (${shareLabel(pay.shareBps)})`}
        value={earned}
        last={last}
      />
    </>
  );
}
