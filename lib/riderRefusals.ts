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
    message: "This job is no longer available to you. It timed out or went to another rider.",
    step: null,
  },
  // Cash on delivery (gridgo-api `docs/CASH_ON_DELIVERY_API.md`).
  cash_wallet_insufficient: {
    message:
      "Your wallet does not cover GRIDGO's share of this cash job, so it was not accepted. Top up your wallet, then wait for the next offer.",
    step: null,
  },
  cash_shop_funds_confirmation_required: {
    message: "Tick that you have the shop's cash with you, then accept again.",
    step: null,
  },
  cash_offer_id_required: {
    message: "This offer has moved on. Wait for it to come back, or for the next one.",
    step: null,
  },
  cash_disabled: {
    message: "Cash jobs are switched off right now, so wallet top-ups are closed. Your balance is safe.",
    step: null,
  },
  cash_stale: {
    message: "This cash job changed while you were here. Check what it shows now, then try again.",
    step: null,
  },
  cash_idempotency_conflict: {
    message: "Something about this step changed since you first sent it. Check it again, then send it once more.",
    step: null,
  },
  cash_idempotency_required: {
    message: "This app is out of date for cash jobs. Update it before taking more work.",
    step: null,
  },
  cash_exact_shop_payment_required: {
    message: "Pay the shop exactly the amount shown — not more, not less — then try again.",
    step: null,
  },
  cash_exact_collection_required: {
    message: "Collect exactly the amount shown from the client before you record it.",
    step: null,
  },
  cash_evidence_required: {
    message: "GRIDGO did not get the photo. Take it again, wait for it to show as saved, then send.",
    step: null,
  },
  cash_evidence_already_bound: {
    message: "That photo is already used on another record. Take a new photo, then send.",
    step: null,
  },
  cash_shop_payment_not_available: {
    message: `The shop payment is already recorded or no longer needed on this job. ${TRIP}`,
    step: "trip",
  },
  cash_shop_receipt_required: {
    message: "Pay the shop and send its receipt photo before you check the job.",
    step: "trip",
  },
  cash_arrival_required: {
    message: "Tell GRIDGO you are at the client's door first, then collect the cash.",
    step: null,
  },
  cash_collection_not_available: {
    message: `The client's cash cannot be recorded on this job now. ${TRIP}`,
    step: "trip",
  },
  cash_incident_hold: {
    message: "Operations has stopped this cash job while it sorts out a problem with the shop. Keep the package and the cash, and wait for their call.",
    step: null,
  },
  cash_work_held: {
    message: "This job is on hold, so no cash can be recorded. Keep everything with you and call Operations.",
    step: null,
  },
  cash_no_show_hold: {
    message: "Your no-show report is with Operations. Take the package to GRIDGO Office and wait for their alert.",
    step: null,
  },
  cash_no_show_not_available: {
    message: "The no-show wait cannot start or be reported on this job now. Check the job, or call Operations.",
    step: null,
  },
  cash_wait_not_elapsed: {
    message: "The wait is not over yet. Stay at the door and report when the timer ends.",
    step: null,
  },
  cash_contact_required: {
    message: "Choose whether you called or messaged the client.",
    step: null,
  },
  cash_reference_required: {
    message: "Type the reference number from your payment app.",
    step: null,
  },
  cash_topup_amount_invalid: {
    message: "Choose ₱200, ₱500 or ₱1,000 — the amounts GRIDGO accepts for a top-up.",
    step: null,
  },
  cash_transfer_duplicate: {
    message: "That reference has already been used. Check it against your payment app.",
    step: null,
  },
  cash_client_signature_required: {
    message: "On a cash job the client signs the receipt on your phone before you hand it over.",
    step: null,
  },
  cash_reservation_required: {
    message: "GRIDGO could not find the share held for this job. Keep the cash and call Operations.",
    step: null,
  },
  cash_route_required: {
    message: "A cash job moves only through its cash steps. Go back to the trip and follow the next step there.",
    step: "trip",
  },
  cash_governed_handover_required: {
    message: "A cash job moves only through its cash steps. Go back to the trip and follow the next step there.",
    step: "trip",
  },

  // The digital acknowledgement receipt at the door.
  acknowledgement_signature_required: {
    message: "The person receiving the package has to sign the receipt on your phone first.",
    step: null,
  },
  acknowledgement_signer_name_required: {
    message: "Type the full name of the person receiving the package, then confirm again.",
    step: null,
  },
  acknowledgement_receipt_mismatch: {
    message: "The receipt changed while you were here. Ask them to sign again on the receipt shown now.",
    step: null,
  },
  invalid_acknowledgement_signature: {
    message: "GRIDGO could not use that signature. Ask them to sign again, then confirm.",
    step: null,
  },
  dispatch_offer_stale: {
    message: "This offer has changed since you opened it. Check the new one before you accept.",
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

  // The reminder card at the door and its optional package photo
  // (gridgo-api `docs/SHARING_AND_REMINDERS_API.md` → *Rider delivery completion*).
  unsupported_handoff_reminder_version: {
    message:
      "GRIDGO's server does not recognise this app's door reminder, so nothing was recorded. Keep the package, update the app, and call Operations if it keeps happening.",
    step: null,
  },
  client_reminder_required: {
    message:
      "GRIDGO needs your tick that you reminded the client. Say the lines on the card, tick it, then confirm again.",
    step: null,
  },
  invalid_photo_consent: {
    message:
      "The client's photo answer did not reach the server in one piece. Tick or untick the photo box again, then confirm again.",
    step: null,
  },
  invalid_package_photo: {
    message:
      "The package photo did not reach the server in one piece, so it was removed. Take it again, or confirm without it.",
    step: null,
  },
  package_photo_consent_required: {
    message:
      "A package photo needs the client's agreement. Tick that the client agreed, or confirm without the photo.",
    step: null,
  },
  package_photo_required: {
    message:
      "The package photo is not on this job, so it was removed. Take it again, or confirm without it.",
    step: null,
  },
  package_photo_upload_not_allowed: {
    message: `The package photo can only be added while you are delivering to the client's door. ${TRIP}`,
    step: "trip",
  },
  delivery_reminder_not_available: {
    message:
      "This job ends at GRIDGO Office, so there is no client to remind. Go back to the trip and open the drop-off again.",
    step: "trip",
  },

  // The acknowledgement receipt, prepared at the door and issued again by the
  // delivery itself when it was not (gridgo-api ACKNOWLEDGEMENT_RECEIPTS_API.md).
  acknowledgement_not_available: {
    message: `GRIDGO issues the receipt only while you are delivering this job to the client's door. ${TRIP}`,
    step: "trip",
  },
  acknowledgement_payment_pending: {
    message:
      "The client's payment is not settled yet, so GRIDGO cannot issue the receipt or record the delivery. Keep the package and call Operations.",
    step: null,
  },
  acknowledgement_amount_unavailable: {
    message:
      "This order's amounts are incomplete, so GRIDGO cannot issue the receipt or record the delivery. Do not write the amounts yourself — keep the package and call Operations.",
    step: null,
  },
  acknowledgement_amount_mismatch: {
    message:
      "This order's amounts do not add up, so GRIDGO cannot issue the receipt or record the delivery. Do not write the amounts yourself — keep the package and call Operations.",
    step: null,
  },
  acknowledgement_customer_unavailable: {
    message:
      "The client's account has no name on file, so GRIDGO cannot issue the receipt or record the delivery. Keep the package and call Operations.",
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
