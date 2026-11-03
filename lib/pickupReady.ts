import type { Order } from "@/lib/api";
import { pinConfirmedAtLabel } from "@/lib/deliveryPin";

/**
 * When the shop will have the job ready, for the offer card: "Ready for pickup
 * by 2:14 PM today", or null when the offer carries no time.
 *
 * This reads only `readyBy`, the shop's own ready time, and says it as a
 * pickup time. It is never a delivery deadline: the API has none for riders.
 * `promisedDate` and `promiseBy` are the client's padded promise and must not
 * stand in when `readyBy` is missing — the staff dashboard once shipped that
 * mix-up, and a rider shown the client's date rides to the wrong clock.
 */
export function pickupReadyLabel(
  order: Pick<Order, "readyBy">,
  now: Date | number = Date.now(),
): string | null {
  const readyBy = order.readyBy;
  if (!readyBy) return null;
  const at = Date.parse(readyBy);
  if (Number.isNaN(at)) return null;
  if (at <= new Date(now).getTime()) return "Ready for pickup now";
  const when = pinConfirmedAtLabel(readyBy, now);
  return when ? `Ready for pickup by ${when}` : null;
}
