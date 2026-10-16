/**
 * What every refusal on a rider's trip means, and where it sends them.
 *
 * gridgo-api `docs/SHOP_HANDOVER_API.md` → *Rider client refusal codes* lists
 * every code a rider app can meet on an assigned trip, by route: accept, the
 * unpacked inspection and its photos, the shop's signature, pickup-confirm,
 * out for delivery, delivery proof and the drop at GRIDGO Office. Each one has
 * a sentence here saying what happened and what to do next — a rider holding
 * someone's print job at a counter cannot act on "not recorded, try again",
 * and that is all a code missing from this table ever shows.
 *
 * `step` names the screen that fixes it when the refusal means a step is
 * missing or the job has moved on, so the screen can offer the way there.
 */

export type RefusalStep = "pickup" | "pack" | "handoff" | "delivery" | "trip";

export type RiderRefusal = {
  message: string;
  step: RefusalStep | null;
};

type Entry = RiderRefusal | ((body: Record<string, unknown>) => RiderRefusal);

const TRIP = "Go back to the trip to see where the job is now.";

/** The documented rider refusals, by code. */
const REFUSALS: Record<string, Entry> = {
  // Any trip route.
  forbidden: {
    message: `This job is no longer assigned to you, so nothing was recorded. ${TRIP}`,
    step: "trip",
  },
  rider_not_approved: {
    message:
      "Operations has not approved this rider account yet, so no work can be taken on it.",
    step: null,
  },
  order_not_found: {
    message:
      "This job no longer exists, so nothing was recorded. If you still have the package, keep it and call Operations.",
    step: "trip",
  },
  reschedule_fulfillment_stopped: {
    message:
      "This job is paused while the client reschedules it. Keep the package where it is and wait for Operations to tell you what to do.",
    step: null,
  },
  shop_recovery_pending: {
    message:
      "This job is paused while GRIDGO sorts out a problem with the shop. Do not take the package — wait for Operations.",
    step: null,
  },
  refund_fulfillment_stopped: {
    message:
      "This job is paused because the client asked for a refund. Keep the package where it is and wait for Operations to tell you where it goes.",
    step: null,
  },

  // Accepting a new job.
  not_offerable: {
    message: "This job is no longer available. Pull down to refresh the list.",
    step: null,
  },
  dispatch_paused: {
    message:
      "This job is paused, so it cannot be taken right now. Wait for Operations to clear it, or choose another available job.",
    step: null,
  },
  pickup_fulfillment_not_available: {
    message:
      "This job cannot be taken by a rider yet. Pull down to refresh the list and choose another.",
    step: null,
  },
  outside_operating_hours: (body) => {
    const opens = opensAt(body.scheduledReviewAt);
    return {
      message: opens
        ? `GRIDGO is closed right now, so nothing was recorded. It opens again ${opens} — try again then.`
        : "GRIDGO is closed right now, so nothing was recorded. Try again once GRIDGO opens.",
      step: null,
    };
  },

  // Already packed when the rider arrived.
  arrived_packed_not_available: {
    message:
      "This can only be noted before the items are checked, and this job is past that. Nothing changed — go back and carry on with the next step.",
    step: "trip",
  },

  // Trip progress updates.
  invalid_delivery_milestone: {
    message:
      "This app sent a trip update the server does not recognise. Update the app, then carry on with the trip.",
    step: null,
  },
  delivery_milestone_not_available: {
    message: `That trip update does not fit where this job is now, so it was not recorded. ${TRIP}`,
    step: "trip",
  },

  // The six checks (the unpacked inspection on a job the rider packs).
  pickup_checklist_not_available: {
    message: `The pickup checks are closed on this job — it has left the shop or was given to another rider. ${TRIP}`,
    step: "trip",
  },
  pickup_escalation_open: {
    message:
      "Do not transport this package. Operations is still handling the failed check — wait for their instruction, then run all six checks again.",
    step: null,
  },
  claim_hold_active: {
    message:
      "Do not take the package. A client claim has put this job on hold — wait for Operations before you continue.",
    step: null,
  },
  pickup_count_unavailable: {
    message:
      "This order has no count to check against. Do not take the package — call Operations to review the order.",
    step: null,
  },
  invalid_pickup_checklist: {
    message: "Answer all six checks before submitting them.",
    step: null,
  },
  invalid_pickup_counts: {
    message:
      "The counts did not line up with this order. Pull down to refresh the job, then count every line again.",
    step: null,
  },
  checklist_evidence_required: {
    message: "Photograph the problem and describe it before the escalation can be filed.",
    step: null,
  },
  invalid_checklist_evidence: {
    message: "The photo did not reach the job. Take it again and send it before escalating.",
    step: null,
  },

  // The shop's signature and custody.
  handover_flow_not_available: {
    message:
      "This job uses the older pickup, where the checks and the shop's signature go in together. Open the pickup checks and run them again.",
    step: "pickup",
  },
  unpacked_inspection_required: {
    message:
      "The unpacked check is not recorded for this job, so the shop cannot sign yet. Open the pickup checks and run all six with the shop.",
    step: "pickup",
  },
  packing_photo_required: {
    message:
      "The packed photo is not saved for this check, so the shop cannot sign yet. Take the packed photo, then the shop signs.",
    step: "pack",
  },
  pickup_held: {
    message:
      "Do not take the package. GRIDGO has put this job on hold — wait for Operations before you continue.",
    step: null,
  },
  handoff_signature_required: {
    message:
      "The shop has not signed yet, so the package is not yours to carry. Open the shop's signature and hand them your phone.",
    step: "handoff",
  },
  handoff_signer_name_required: {
    message: "Type the name of the person at the shop who signed.",
    step: null,
  },
  invalid_handoff_signature: {
    message:
      "The signature did not reach the job. Ask the supplier to sign again and wait for it to save.",
    step: null,
  },
  handoff_signature_upload_not_allowed: {
    message: `This job has already left the shop, so a signature cannot be added now. ${TRIP}`,
    step: "trip",
  },

  // Leaving the shop.
  transition_not_allowed: {
    message: `The trip starts only once the shop has signed and the package is with you. ${TRIP}`,
    step: "trip",
  },

  // Delivery proof, the door, and the drop at GRIDGO Office.
  delivery_photo_upload_not_allowed: {
    message: `This job is not at the delivery step, so the photo was not added. ${TRIP}`,
    step: "trip",
  },
  delivery_not_available: {
    message: `Delivery opens once the shop has signed and you have left with the package. ${TRIP}`,
    step: "trip",
  },
  final_payment_not_confirmed: {
    message:
      "Operations has not confirmed the client's final payment, so this delivery cannot be closed. Keep the package and call Operations.",
    step: null,
  },
  pof_required: {
    message:
      "The proof of fulfilment did not reach the server. Take the photo again and wait for it to save.",
    step: null,
  },
  invalid_delivery_evidence_type: {
    message: "The evidence is not on the job yet. Take the photo again and wait for it to save.",
    step: null,
  },
  delivery_evidence_required: {
    message: "The evidence is not on the job yet. Take the photo again and wait for it to save.",
    step: null,
  },
  handover_not_ready: {
    message:
      "This job has no handover code to check right now. Go back to the trip and pull down to refresh it.",
    step: "trip",
  },
  handover_already_completed: {
    message: `This handover is already recorded. ${TRIP}`,
    step: "trip",
  },
  handover_otp_mismatch: {
    message:
      "The handover code did not match. Do not hand the package over — escalate to Operations.",
    step: null,
  },
  handover_attempts_exceeded: {
    message:
      "Too many codes were refused on this job, so it is locked for a few minutes. Keep the package and escalate to Operations.",
    step: null,
  },
};

/** When a closed GRIDGO opens again, in Davao's own clock. */
function opensAt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  const day = at.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "long" });
  const time = at.toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });
  return `on ${day} at ${time}`;
}

/** The refusal for a documented code, or null for anything else. */
export function riderRefusal(
  code: string | null | undefined,
  body: Record<string, unknown> = {},
): RiderRefusal | null {
  if (!code) return null;
  const entry = REFUSALS[code];
  if (!entry) return null;
  return typeof entry === "function" ? entry(body) : entry;
}

/** Every code this table answers; tests hold it to the API's list. */
export const RIDER_REFUSAL_CODES = Object.keys(REFUSALS);

/** The button that takes the rider to the step a refusal names. */
export const REFUSAL_STEP_ACTION: Record<
  RefusalStep,
  { label: string; pathname: "/trip/pickup" | "/trip/pack" | "/trip/handoff" | "/trip/delivery" | null }
> = {
  pickup: { label: "Open the pickup checks", pathname: "/trip/pickup" },
  pack: { label: "Take the packed photo", pathname: "/trip/pack" },
  handoff: { label: "Open the shop's signature", pathname: "/trip/handoff" },
  delivery: { label: "Open the delivery step", pathname: "/trip/delivery" },
  trip: { label: "Back to the trip", pathname: null },
};
