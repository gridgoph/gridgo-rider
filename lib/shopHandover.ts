import type { Order } from "@/lib/api";

/**
 * The shop-to-rider handover where the shop packs in front of the rider
 * (report 6C695C15, gridgo-api `docs/SHOP_HANDOVER_API.md`).
 *
 * On a `rider_packs` job the counter runs in three steps, each one recorded by
 * the server before the next is allowed:
 *
 *  1. **Check** — the six checks and the count, on the items *unpacked*. Six
 *     passes come back as `pickupChecklist.status: "inspected"`; nothing moves.
 *  2. **Pack** — the shop packs them in front of the rider, who photographs the
 *     packed job (`packing_photo`, bound to that inspection).
 *  3. **Sign** — the shop signs on the rider's phone, and
 *     `POST /dispatch/:id/pickup-confirm` hands the package over.
 *
 * A `legacy` job — every payout-plan-1 order, and anything already ready for
 * pickup before the change — keeps the old counter: checks and signature in
 * one request. The order says which; an API that does not say is `legacy`.
 *
 * Pure, so the step a rider is on can be tested without a counter.
 */

export type HandoverStep = "check" | "pack" | "sign";

/** The three steps in order, with the words the stepper shows. */
export const HANDOVER_STEPS: readonly { step: HandoverStep; label: string }[] = [
  { step: "check", label: "Check unpacked" },
  { step: "pack", label: "Packed photo" },
  { step: "sign", label: "Shop signs" },
] as const;

type HandoverOrder = Pick<Order, "state" | "riderId" | "pickupChecklist"> &
  Partial<Pick<Order, "handoverFlow" | "shopHandover" | "riderAssignedAt">>;

export function ridersPack(order: Partial<Pick<Order, "handoverFlow">>): boolean {
  return order.handoverFlow === "rider_packs";
}

/**
 * The inspection the server will confirm the pickup from, or null.
 *
 * The server's own rule: an `inspected` record, by the rider who now holds
 * the job. A reassigned job's inspection belonged to someone else.
 */
export function currentInspectionId(order: HandoverOrder): string | null {
  if (!ridersPack(order)) return null;
  const record = order.pickupChecklist;
  if (record?.status !== "inspected" || !record.inspectionId) return null;
  if (!order.riderId || record.completedBy !== order.riderId) return null;
  return record.inspectionId;
}

/** Whether the packed photo for the current inspection is on the server. */
export function packedPhotoStored(order: HandoverOrder): boolean {
  const inspectionId = currentInspectionId(order);
  if (!inspectionId) return false;
  return (order.shopHandover?.packingPhotos ?? []).some(
    (photo) => photo.inspectionId === inspectionId,
  );
}

/** When the packed photo for the current inspection was attached, or null. */
export function packedPhotoAt(order: HandoverOrder): string | null {
  const inspectionId = currentInspectionId(order);
  if (!inspectionId) return null;
  const photos = (order.shopHandover?.packingPhotos ?? []).filter(
    (photo) => photo.inspectionId === inspectionId,
  );
  return photos.at(-1)?.at ?? null;
}

/**
 * Which counter step a `rider_packs` job is on, or null when the counter is
 * not where the job is: a legacy job, a job already carried, or one held by a
 * failed check (that hold outranks every step).
 */
export function handoverStep(order: HandoverOrder): HandoverStep | null {
  if (!ridersPack(order) || order.state !== "rider_assigned") return null;
  if (order.pickupChecklist?.status === "failed_escalated") return null;
  if (!currentInspectionId(order)) return "check";
  return packedPhotoStored(order) ? "sign" : "pack";
}

/**
 * When this rider recorded that the shop had packed the job before the check,
 * or null. One mark per assignment, as the server keeps them.
 */
export function arrivedPackedAt(order: HandoverOrder): string | null {
  if (!order.riderId) return null;
  const assignedAt = order.riderAssignedAt ?? null;
  const mark = (order.shopHandover?.arrivedPacked ?? []).find(
    (event) => event.riderId === order.riderId && (event.assignedAt ?? null) === assignedAt,
  );
  return mark?.at ?? null;
}

/**
 * Whether "the shop packed it already" can still be recorded: a `rider_packs`
 * job at the counter, before the unpacked check. Afterwards the check itself
 * is the record of what the rider saw.
 */
export function canMarkArrivedPacked(order: HandoverOrder): boolean {
  return (
    ridersPack(order) &&
    order.state === "rider_assigned" &&
    !currentInspectionId(order) &&
    !arrivedPackedAt(order)
  );
}

/**
 * The newest reason GRIDGO gave for forcing a shop step, or null.
 *
 * The rider is told the job was forced, and why, because what was skipped is
 * the shop's own evidence of the finished work: the unpacked check at the
 * counter is then the only look anyone has had.
 */
export function forcedStepNote(order: Partial<Pick<Order, "forcedSteps">>): string | null {
  const note = order.forcedSteps?.at(-1)?.note?.trim();
  return note || null;
}
