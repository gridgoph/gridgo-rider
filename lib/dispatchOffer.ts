import { isHomePrinter } from "@/lib/homePrinter";
import type { Order } from "@/lib/api";

/**
 * The one offer a rider is looking at, and how long it has left.
 *
 * gridgo-api `docs/RIDER_MAP_HOME_API.md` is the contract: each rider holds at
 * most one unaccepted, exclusive reservation with a snapshotted countdown, and
 * the server refuses it at its expiry instant. The countdown here is a reading
 * of the server's clock, not the phone's — a phone a minute fast would
 * otherwise hide a live offer, and one a minute slow would offer a dead one.
 *
 * Pure, so the countdown and the choice of offer can be tested without a map.
 */

/** Milliseconds to add to this phone's clock to read the server's. */
export function serverClockOffsetMs(serverTime: string | null, receivedAtMs: number): number {
  if (!serverTime) return 0;
  const server = Date.parse(serverTime);
  return Number.isFinite(server) ? server - receivedAtMs : 0;
}

/**
 * The job this rider may accept right now, or null.
 *
 * On an exclusive-offer API that is the one `ready_for_dispatch` job whose
 * `dispatchOffer` is `offered` to this rider and not yet expired by the
 * server's clock. An older API with no `dispatchOffer` at all keeps its shared
 * pool, so its newest open job stands in as the one offer.
 */
export function currentOffer(
  offers: readonly Order[],
  riderId: string | null,
  serverNowMs: number,
): Order | null {
  const open = offers.filter((order) => order.state === "ready_for_dispatch" && !order.riderId);
  const timed = open.filter((order) => order.dispatchOffer != null);
  if (!timed.length) {
    return [...open].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0] ?? null;
  }
  return (
    timed.find((order) => {
      const offer = order.dispatchOffer;
      if (offer?.status !== "offered") return false;
      if (riderId && offer.riderId && offer.riderId !== riderId) return false;
      const expires = offer.expiresAt ? Date.parse(offer.expiresAt) : NaN;
      return Number.isFinite(expires) && expires > serverNowMs;
    }) ?? null
  );
}

/**
 * Whole seconds left on the offer, never below zero and never above the
 * countdown the server snapshotted. Null for an untimed (older API) offer.
 */
export function offerSecondsLeft(order: Order, serverNowMs: number): number | null {
  const offer = order.dispatchOffer;
  if (!offer?.expiresAt) return null;
  const expires = Date.parse(offer.expiresAt);
  if (!Number.isFinite(expires)) return null;
  const left = Math.max(0, Math.ceil((expires - serverNowMs) / 1000));
  const cap = offer.timeoutSeconds;
  return typeof cap === "number" && cap > 0 ? Math.min(left, cap) : left;
}

/** How much of the countdown remains, 0–1, for the draining bar. */
export function offerFractionLeft(order: Order, serverNowMs: number): number | null {
  const left = offerSecondsLeft(order, serverNowMs);
  const total = order.dispatchOffer?.timeoutSeconds;
  if (left == null || typeof total !== "number" || total <= 0) return null;
  return Math.min(1, Math.max(0, left / total));
}

/** "0:18" — minutes and seconds, the way a countdown is read at a glance. */
export function countdownLabel(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** What a screen reader says, once the number is worth saying. */
export function countdownSpoken(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return whole === 1 ? "1 second left to accept" : `${whole} seconds left to accept`;
}

/**
 * The shop-to-drop-off distance, from the order's stored figure.
 *
 * Straight-line metres the delivery fee was banded from — never a road
 * distance and never a travel time. The API has no routing provider
 * (`durationSeconds` is always null), so this app does not invent one.
 */
export function offerDistanceMetres(order: Order): number | null {
  const metres = order.travelEstimate?.distanceMeters ?? order.deliveryDistanceMeters ?? null;
  return typeof metres === "number" && Number.isFinite(metres) && metres >= 0 ? metres : null;
}

export function offerDistanceLabel(order: Order): string | null {
  const metres = offerDistanceMetres(order);
  if (metres == null) return null;
  // A home printer's figure is already rounded up to 500 m by the server, so
  // it is said as "about" and never re-rounded into false precision.
  if (isHomePrinter(order) || order.travelEstimate?.distanceApproximate) {
    const about = metres < 1000 ? `${metres} m` : `${Number((metres / 1000).toFixed(1))} km`;
    return `About ${about} from pickup to drop-off`;
  }
  const amount = metres < 1000 ? `${Math.max(100, Math.round(metres / 100) * 100)} m` : `${(metres / 1000).toFixed(1)} km`;
  return `${amount} from shop to drop-off`;
}

export type CargoLine = { key: string; description: string; quantity: number };

/** What the rider will carry, line by line, with the order title as the fallback. */
export function cargoLines(order: Order): CargoLine[] {
  const lines = order.cargoSummary?.lines ?? [];
  const named = lines
    .filter((line) => Number.isFinite(line.quantity) && line.quantity > 0)
    .map((line) => ({
      key: line.lineItemId,
      description: line.description?.trim() || order.title,
      quantity: line.quantity,
    }));
  if (named.length) return named;
  return order.quantity > 0 ? [{ key: order.id, description: order.title, quantity: order.quantity }] : [];
}

/** "12 pieces" across every line, or null when nothing is counted. */
export function cargoTotalLabel(order: Order): string | null {
  const total = order.cargoSummary?.totalQuantity ?? cargoLines(order).reduce((sum, line) => sum + line.quantity, 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  return total === 1 ? "1 piece" : `${total} pieces`;
}

/** The id to send with Accept or Decline, when the server issued one. */
export function offerIdOf(order: Order): string | null {
  return order.dispatchOffer?.status === "offered" && order.dispatchOffer.id ? order.dispatchOffer.id : null;
}
