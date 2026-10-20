import { ApiError, apiErrorMessage, tripRefusal } from "@/lib/api";
import { storageErrorMessage } from "@/lib/attachments";
import { RIDER_REFUSAL_CODES, riderRefusal } from "@/lib/riderRefusals";

const FALLBACK = "FALLBACK";

/**
 * gridgo-api `docs/SHOP_HANDOVER_API.md` → "Rider client refusal codes", copied
 * by route. A code added there belongs here and in `lib/riderRefusals.ts`.
 */
const DOCUMENTED: Record<string, string[]> = {
  "any route": [
    "forbidden",
    "rider_not_approved",
    "order_not_found",
    "reschedule_fulfillment_stopped",
    "shop_recovery_pending",
    "refund_fulfillment_stopped",
  ],
  accept: ["not_offerable", "dispatch_paused", "pickup_fulfillment_not_available", "outside_operating_hours"],
  "arrived-packed": ["arrived_packed_not_available"],
  milestones: ["invalid_delivery_milestone", "delivery_milestone_not_available"],
  "pickup-checklist": [
    "pickup_checklist_not_available",
    "pickup_escalation_open",
    "claim_hold_active",
    "pickup_count_unavailable",
    "invalid_pickup_checklist",
    "invalid_pickup_counts",
    "checklist_evidence_required",
    "invalid_checklist_evidence",
    "handoff_signature_required",
    "handoff_signer_name_required",
    "invalid_handoff_signature",
  ],
  "pickup-confirm": [
    "handover_flow_not_available",
    "pickup_checklist_not_available",
    "pickup_escalation_open",
    "claim_hold_active",
    "unpacked_inspection_required",
    "packing_photo_required",
    "handoff_signature_required",
    "handoff_signer_name_required",
    "invalid_handoff_signature",
  ],
  "attach packing_photo": ["unpacked_inspection_required", "pickup_held"],
  "attach handoff_signature": [
    "unpacked_inspection_required",
    "packing_photo_required",
    "handoff_signature_upload_not_allowed",
  ],
  "attach delivery_photo": ["delivery_photo_upload_not_allowed"],
  out_for_delivery: ["transition_not_allowed"],
  delivery: [
    "delivery_not_available",
    "final_payment_not_confirmed",
    "pof_required",
    "invalid_delivery_evidence_type",
    "delivery_evidence_required",
    "handover_not_ready",
    "handover_already_completed",
    "handover_otp_mismatch",
    "handover_attempts_exceeded",
  ],
  // gridgo-api `docs/ACKNOWLEDGEMENT_RECEIPTS_API.md` → "Errors and rollout":
  // preparing the receipt at the door, and the delivery that issues it too.
  "acknowledgement-receipt": [
    "acknowledgement_not_available",
    "acknowledgement_payment_pending",
    "acknowledgement_amount_unavailable",
    "acknowledgement_amount_mismatch",
    "acknowledgement_customer_unavailable",
  ],
};

const ALL = [...new Set(Object.values(DOCUMENTED).flat())];
const ATTACH = [
  ...DOCUMENTED["attach packing_photo"]!,
  ...DOCUMENTED["attach handoff_signature"]!,
  ...DOCUMENTED["attach delivery_photo"]!,
];

describe("every documented rider refusal reads as a reason and a next step", () => {
  it("covers the API's whole list", () => {
    expect(ALL.filter((code) => !RIDER_REFUSAL_CODES.includes(code))).toEqual([]);
  });

  it.each(ALL)("%s says what happened in plain words", (code) => {
    const message = apiErrorMessage(new ApiError(409, { error: code }), FALLBACK);
    expect(message).not.toBe(FALLBACK);
    expect(message).not.toContain("_");
    expect(message).not.toMatch(/not recorded\. .*try again\.?$/i);
    expect(tripRefusal(new ApiError(409, { error: code }), FALLBACK).message).toBe(
      riderRefusal(code)!.message,
    );
  });

  it.each(ATTACH)("an attach refused with %s reads the same as the step", (code) => {
    expect(storageErrorMessage(code, 409)).toBe(riderRefusal(code)!.message);
  });
});

describe("a refusal that means a step is missing names that step", () => {
  it.each([
    ["unpacked_inspection_required", "pickup"],
    ["handover_flow_not_available", "pickup"],
    ["packing_photo_required", "pack"],
    ["handoff_signature_required", "handoff"],
    ["transition_not_allowed", "trip"],
    ["delivery_not_available", "trip"],
    ["delivery_photo_upload_not_allowed", "trip"],
  ])("%s → %s", (code, step) => {
    expect(riderRefusal(code)?.step).toBe(step);
  });

  it("holds and failed codes offer no step to skip ahead to", () => {
    for (const code of ["pickup_held", "claim_hold_active", "pickup_escalation_open", "handover_otp_mismatch"]) {
      expect(riderRefusal(code)?.step).toBeNull();
    }
  });

  it("reads the step from a refused attach, which carries the code on the error", () => {
    const attachFailure = Object.assign(new Error("unpacked_inspection_required"), {
      code: "unpacked_inspection_required",
    });
    expect(tripRefusal(attachFailure, FALLBACK).step).toBe("pickup");
  });
});

describe("closed hours", () => {
  it("names when GRIDGO opens, on Davao's clock", () => {
    const message = apiErrorMessage(
      new ApiError(409, {
        error: "outside_operating_hours",
        scheduledReviewAt: "2026-10-17T00:00:00.000Z",
      }),
      FALLBACK,
    );
    expect(message).toMatch(/GRIDGO is closed right now, so nothing was recorded/);
    expect(message).toMatch(/opens again on Saturday at 8:00\s?AM/i);
  });

  it("still explains itself without a time", () => {
    expect(apiErrorMessage(new ApiError(409, { error: "outside_operating_hours" }), FALLBACK)).toBe(
      "GRIDGO is closed right now, so nothing was recorded. Try again once GRIDGO opens.",
    );
  });
});

it("keeps the caller's sentence for a code the API does not document", () => {
  const refusal = tripRefusal(new ApiError(409, { error: "something_new" }), FALLBACK);
  expect(refusal).toEqual({ message: FALLBACK, step: null });
});
