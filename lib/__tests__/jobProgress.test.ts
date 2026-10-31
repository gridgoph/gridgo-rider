import type { Order, PickupChecklistRecord } from "@/lib/api";
import { jobProgress } from "@/lib/jobProgress";
import { PICKUP_CHECK_CODES } from "@/lib/pickupChecklist";
import { tripPhase } from "@/lib/riderOrder";

const RIDER = "user_rider";

function checklist(
  status: PickupChecklistRecord["status"],
  overrides: Partial<PickupChecklistRecord> = {},
): PickupChecklistRecord {
  return {
    status,
    checks: PICKUP_CHECK_CODES.map((code) => ({ code, passed: status !== "failed_escalated" })),
    evidenceFileIds: [],
    failureNote: null,
    completedAt: "2026-10-31T01:00:00.000Z",
    completedBy: RIDER,
    escalationId: null,
    signOffPrompt: null,
    ...overrides,
  };
}

function job(overrides: Partial<Order> = {}): Order {
  return {
    id: "ord_1",
    riderId: RIDER,
    state: "rider_assigned",
    fulfillmentMode: "delivery",
    handoverFlow: "rider_packs",
    pickupChecklist: null,
    shopHandover: {},
    ...overrides,
  } as Order;
}

const INSPECTED = checklist("inspected", { inspectionId: "insp_1" });
const PACKED = {
  packingPhotos: [{ at: "2026-10-31T01:05:00.000Z", by: RIDER, fileId: "file_pack", inspectionId: "insp_1" }],
};

/** The rail as one string per step, so a whole state reads on one line. */
function rail(order: Order) {
  const progress = jobProgress(order, tripPhase(order));
  return {
    steps: progress.steps.map((step) => `${step.label}: ${step.status}`),
    overline: progress.overline,
    title: progress.title,
    pickupDone: progress.pickupDone,
    dropoffDone: progress.dropoffDone,
  };
}

describe("job progress on a rider_packs counter", () => {
  it("starts on the unpacked check with nothing done", () => {
    expect(rail(job())).toEqual({
      steps: [
        "Check unpacked: now",
        "Packed photo: upcoming",
        "Shop signs: upcoming",
        "Set off: upcoming",
        "Hand over: upcoming",
      ],
      overline: "NEXT STEP · 1 OF 5",
      title: "Check unpacked",
      pickupDone: false,
      dropoffDone: false,
    });
  });

  it("moves to the packed photo once the inspection is recorded", () => {
    const state = rail(job({ pickupChecklist: INSPECTED }));
    expect(state.steps).toEqual([
      "Check unpacked: done",
      "Packed photo: now",
      "Shop signs: upcoming",
      "Set off: upcoming",
      "Hand over: upcoming",
    ]);
    expect(state.overline).toBe("NEXT STEP · 2 OF 5");
    expect(state.title).toBe("Packed photo");
  });

  it("moves to the shop's signature once the packed photo is stored", () => {
    const state = rail(job({ pickupChecklist: INSPECTED, shopHandover: PACKED }));
    expect(state.steps.slice(0, 3)).toEqual(["Check unpacked: done", "Packed photo: done", "Shop signs: now"]);
    expect(state.overline).toBe("NEXT STEP · 3 OF 5");
    expect(state.pickupDone).toBe(false);
  });

  it("holds the check step, and offers no next step, while a failed check is with Operations", () => {
    const state = rail(job({ pickupChecklist: checklist("failed_escalated", { escalationId: "esc_1" }) }));
    expect(state.steps[0]).toBe("Check unpacked: held");
    expect(state.steps.slice(1).every((step) => step.endsWith(": upcoming"))).toBe(true);
    expect(state.overline).toBe("ON HOLD");
    expect(state.title).toBe("Wait for Operations");
  });

  it("marks the whole counter and the pickup done once the package is carried", () => {
    const state = rail(job({ state: "picked_up", pickupChecklist: checklist("passed") }));
    expect(state.steps).toEqual([
      "Check unpacked: done",
      "Packed photo: done",
      "Shop signs: done",
      "Set off: now",
      "Hand over: upcoming",
    ]);
    expect(state.overline).toBe("NEXT STEP · 4 OF 5");
    expect(state.pickupDone).toBe(true);
    expect(state.dropoffDone).toBe(false);
  });

  it("has the hand-over as the last step out for delivery", () => {
    const state = rail(job({ state: "out_for_delivery", pickupChecklist: checklist("passed") }));
    expect(state.steps.at(-2)).toBe("Set off: done");
    expect(state.steps.at(-1)).toBe("Hand over: now");
    expect(state.overline).toBe("NEXT STEP · 5 OF 5");
  });

  it("marks every step and both stops done once delivered", () => {
    const state = rail(job({ state: "delivered", pickupChecklist: checklist("passed") }));
    expect(state.steps.every((step) => step.endsWith(": done"))).toBe(true);
    expect(state.overline).toBe("ALL STEPS DONE");
    expect(state.title).toBe("Delivered");
    expect(state.pickupDone).toBe(true);
    expect(state.dropoffDone).toBe(true);
  });
});

describe("job progress on a legacy counter", () => {
  it("draws the checks and the signature as one step, because they are one request", () => {
    expect(rail(job({ handoverFlow: "legacy" })).steps).toEqual([
      "Check and sign: now",
      "Set off: upcoming",
      "Hand over: upcoming",
    ]);
  });

  it("reaches Set off as step 2 of 3 once picked up", () => {
    const state = rail(job({ handoverFlow: "legacy", state: "picked_up", pickupChecklist: checklist("passed") }));
    expect(state.steps).toEqual(["Check and sign: done", "Set off: now", "Hand over: upcoming"]);
    expect(state.overline).toBe("NEXT STEP · 2 OF 3");
  });

  it("is a legacy counter when the API does not say", () => {
    expect(rail(job({ handoverFlow: undefined })).steps[0]).toBe("Check and sign: now");
  });
});

describe("job progress ending at GRIDGO Office", () => {
  it("names the last step a drop-off", () => {
    const state = rail(job({ fulfillmentMode: "pickup", state: "out_for_delivery", pickupChecklist: checklist("passed") }));
    expect(state.steps.at(-1)).toBe("Drop off: now");
    expect(state.title).toBe("Drop off");
  });

  it("says Dropped off once it is on the shelf", () => {
    const state = rail(job({ fulfillmentMode: "pickup", state: "awaiting_collection", pickupChecklist: checklist("passed") }));
    expect(state.title).toBe("Dropped off");
    expect(state.dropoffDone).toBe(true);
  });
});
