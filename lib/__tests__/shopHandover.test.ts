import type { Order, PickupChecklistRecord } from "@/lib/api";
import { PICKUP_CHECK_CODES } from "@/lib/pickupChecklist";
import {
  arrivedPackedAt,
  canMarkArrivedPacked,
  currentInspectionId,
  forcedStepNote,
  handoverStep,
  packedPhotoAt,
  packedPhotoStored,
  ridersPack,
} from "@/lib/shopHandover";

const RIDER = "user_rider";

function inspected(overrides: Partial<PickupChecklistRecord> = {}): PickupChecklistRecord {
  return {
    status: "inspected",
    inspectionId: "inspection_1",
    checks: PICKUP_CHECK_CODES.map((code) => ({ code, passed: true })),
    evidenceFileIds: [],
    failureNote: null,
    completedAt: "2026-10-15T03:00:00.000Z",
    completedBy: RIDER,
    escalationId: null,
    signOffPrompt: null,
    handoffSignature: null,
    ...overrides,
  };
}

type HandoverOrder = Pick<Order, "state" | "riderId" | "pickupChecklist"> &
  Partial<Pick<Order, "handoverFlow" | "shopHandover" | "riderAssignedAt" | "forcedSteps">>;

function job(overrides: Partial<HandoverOrder> = {}): HandoverOrder {
  return {
    state: "rider_assigned",
    riderId: RIDER,
    pickupChecklist: null,
    handoverFlow: "rider_packs",
    riderAssignedAt: "2026-10-15T02:00:00.000Z",
    shopHandover: {},
    ...overrides,
  };
}

const PHOTO = { at: "2026-10-15T03:05:00.000Z", by: RIDER, fileId: "file_pack", inspectionId: "inspection_1" };

describe("which handover a job runs", () => {
  it("is rider_packs only when the server says so", () => {
    expect(ridersPack({ handoverFlow: "rider_packs" })).toBe(true);
    expect(ridersPack({ handoverFlow: "legacy" })).toBe(false);
    // An API older than the change says nothing: the old counter.
    expect(ridersPack({})).toBe(false);
  });

  it("has no counter steps on a legacy job, whatever its checklist says", () => {
    expect(handoverStep(job({ handoverFlow: "legacy" }))).toBeNull();
    expect(handoverStep(job({ handoverFlow: undefined, pickupChecklist: inspected() }))).toBeNull();
  });
});

describe("the three counter steps", () => {
  it("starts at the unpacked check", () => {
    expect(handoverStep(job())).toBe("check");
  });

  it("moves to the packed photo once the server holds this rider's inspection", () => {
    const checked = job({ pickupChecklist: inspected() });
    expect(currentInspectionId(checked)).toBe("inspection_1");
    expect(handoverStep(checked)).toBe("pack");
  });

  it("moves to the signature once the packed photo is bound to that inspection", () => {
    const packed = job({ pickupChecklist: inspected(), shopHandover: { packingPhotos: [PHOTO] } });
    expect(packedPhotoStored(packed)).toBe(true);
    expect(packedPhotoAt(packed)).toBe(PHOTO.at);
    expect(handoverStep(packed)).toBe("sign");
  });

  it("does not count a packed photo taken for an earlier inspection", () => {
    const rechecked = job({
      pickupChecklist: inspected({ inspectionId: "inspection_2" }),
      shopHandover: { packingPhotos: [PHOTO] },
    });
    expect(packedPhotoStored(rechecked)).toBe(false);
    expect(handoverStep(rechecked)).toBe("pack");
  });

  it("ignores another rider's inspection after a reassignment", () => {
    const reassigned = job({ pickupChecklist: inspected({ completedBy: "user_other" }) });
    expect(currentInspectionId(reassigned)).toBeNull();
    expect(handoverStep(reassigned)).toBe("check");
  });

  it("has no step while a failed check is with Operations, or once the job has left", () => {
    expect(
      handoverStep(job({ pickupChecklist: inspected({ status: "failed_escalated" }) })),
    ).toBeNull();
    expect(handoverStep(job({ state: "picked_up", pickupChecklist: inspected({ status: "passed" }) }))).toBeNull();
  });
});

describe("the shop had packed it before the check", () => {
  const mark = {
    at: "2026-10-15T02:30:00.000Z",
    riderId: RIDER,
    supplierId: "user_supplier",
    assignedAt: "2026-10-15T02:00:00.000Z",
  };

  it("can be recorded before the inspection, once per assignment", () => {
    expect(canMarkArrivedPacked(job())).toBe(true);
    const recorded = job({ shopHandover: { arrivedPacked: [mark] } });
    expect(arrivedPackedAt(recorded)).toBe(mark.at);
    expect(canMarkArrivedPacked(recorded)).toBe(false);
  });

  it("is not offered after the check, or on a legacy job", () => {
    expect(canMarkArrivedPacked(job({ pickupChecklist: inspected() }))).toBe(false);
    expect(canMarkArrivedPacked(job({ handoverFlow: "legacy" }))).toBe(false);
  });

  it("belongs to this rider's assignment, not an earlier one", () => {
    const earlier = job({
      shopHandover: { arrivedPacked: [{ ...mark, assignedAt: "2026-10-14T09:00:00.000Z" }] },
    });
    expect(arrivedPackedAt(earlier)).toBeNull();
    expect(canMarkArrivedPacked(earlier)).toBe(true);
  });
});

describe("forced by GRIDGO", () => {
  it("reads the newest reason", () => {
    expect(
      forcedStepNote({
        forcedSteps: [
          { at: "a", from: "production", to: "supplier_self_qc", reasonCode: "other", note: "first" },
          { at: "b", from: "supplier_self_qc", to: "ready_for_dispatch", reasonCode: "technical_issue", note: " Upload outage " },
        ],
      }),
    ).toBe("Upload outage");
    expect(forcedStepNote({})).toBeNull();
  });
});
