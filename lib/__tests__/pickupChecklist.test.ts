import type { PickupCheckCode } from "@/lib/api";
import {
  canRunPickupChecks,
  allAnswered,
  allPassed,
  checkDefinition,
  checklistActionLabel,
  checklistBlockReason,
  checklistConsequence,
  checklistSummary,
  EMPTY_ANSWERS,
  failedCodes,
  PICKUP_CHECK_CODES,
  PICKUP_CHECKS,
  toChecklistPayload,
  unansweredCodes,
  type ChecklistAnswers,
} from "@/lib/pickupChecklist";

/** The six codes the API contract names, in its order. */
const CONTRACT_CODES: PickupCheckCode[] = [
  "quantity_match",
  "specification_match",
  "visible_defects",
  "packaging_integrity",
  "documentation",
  "supplier_sign_off",
];

function answers(patch: Partial<ChecklistAnswers> = {}): ChecklistAnswers {
  return { ...EMPTY_ANSWERS, ...patch };
}

function allPass(): ChecklistAnswers {
  return Object.fromEntries(
    PICKUP_CHECK_CODES.map((code) => [code, true]),
  ) as ChecklistAnswers;
}

const READY_FAILURE = { note: "Colour is off across the whole batch", evidenceStored: true };

describe("the six checks match the contract exactly", () => {
  it("uses the API's codes, in its order, once each", () => {
    expect([...PICKUP_CHECK_CODES]).toEqual(CONTRACT_CODES);
    expect(PICKUP_CHECKS.map((check) => check.code)).toEqual(CONTRACT_CODES);
    expect(new Set(PICKUP_CHECK_CODES).size).toBe(6);
  });

  it("gives every check a label and a way to verify it, in plain language", () => {
    for (const check of PICKUP_CHECKS) {
      expect(check.label.length).toBeGreaterThan(0);
      expect(check.verify.length).toBeGreaterThan(0);
      expect(check.label).not.toMatch(/_/);
      expect(check.verify).not.toMatch(/_/);
    }
  });

  it("phrases a failure as a failure, not as the label it just contradicted", () => {
    // "no visible defects — transport is on hold" is the bug this guards: a
    // pass-phrased label reads as its own opposite once a check has failed.
    expect(checkDefinition("visible_defects").failure).toBe("there are visible defects");
    for (const check of PICKUP_CHECKS) {
      expect(check.failure.length).toBeGreaterThan(0);
      expect(check.failure).not.toBe(check.label.toLowerCase());
      expect(check.failure).not.toMatch(/_/);
      // Written to drop into a sentence, so it starts lower case.
      expect(check.failure[0]).toBe(check.failure[0].toLowerCase());
    }
  });

  it("sends every code with a boolean, whatever the rider answered", () => {
    const payload = toChecklistPayload(answers({ quantity_match: true }));
    expect(payload.map((item) => item.code)).toEqual(CONTRACT_CODES);
    expect(payload.every((item) => typeof item.passed === "boolean")).toBe(true);
    // Unanswered must never be sent as a pass — but a complete payload is only
    // ever submitted once `allAnswered` holds, which the gate enforces.
    expect(payload.find((item) => item.code === "documentation")?.passed).toBe(false);
  });
});

describe("nothing is submitted until all six are answered", () => {
  it("counts what is left, and names it when there is one", () => {
    expect(unansweredCodes(EMPTY_ANSWERS)).toHaveLength(6);
    expect(checklistBlockReason(EMPTY_ANSWERS, READY_FAILURE)).toBe("6 checks left to answer.");

    const one = allPass();
    one.supplier_sign_off = null;
    expect(checklistBlockReason(one, READY_FAILURE)).toBe("One check left: supplier signs off.");
  });

  it("lets a clean sweep straight through", () => {
    const passed = allPass();
    expect(allAnswered(passed)).toBe(true);
    expect(allPassed(passed)).toBe(true);
    expect(checklistBlockReason(passed, { note: "", evidenceStored: false })).toBeNull();
    expect(checklistActionLabel(passed)).toMatch(/take the package/i);
  });
});

describe("a failed check cannot be escalated on a tap alone", () => {
  const failing = { ...allPass(), visible_defects: false };

  it("demands the photo first, and says why", () => {
    const reason = checklistBlockReason(failing, { note: "", evidenceStored: false });
    expect(reason).toMatch(/photograph/i);
    // The captain's reasoning belongs in the copy, not in a policy document.
    expect(reason).toMatch(/GRIDGO/);
  });

  it("demands a sentence Operations can act on, not a word", () => {
    expect(checklistBlockReason(failing, { note: "bad", evidenceStored: true })).toMatch(
      /describe/i,
    );
    expect(checklistBlockReason(failing, READY_FAILURE)).toBeNull();
  });

  it("names the outcome on the button rather than a bare Submit", () => {
    expect(checklistActionLabel(failing)).toMatch(/do not transport/i);
    expect(checklistActionLabel(failing)).not.toMatch(/^submit$/i);
  });

  it("states the consequence in the rider's terms before they commit", () => {
    const consequence = checklistConsequence(failing);
    expect(consequence).toMatch(/stays at the shop/i);
    expect(consequence).toMatch(/founder/i);
    expect(consequence).toContain(checkDefinition("visible_defects").failure);
    expect(consequence).not.toMatch(/_/);

    const passing = checklistConsequence(allPass());
    expect(passing).toMatch(/out loud/i);

    // Nothing to promise until every answer is in.
    expect(checklistConsequence(EMPTY_ANSWERS)).toBeNull();
  });

  it("lists the failures in checklist order", () => {
    expect(
      failedCodes({ ...allPass(), documentation: false, quantity_match: false }),
    ).toEqual(["quantity_match", "documentation"]);
  });
});

describe("what a recorded checklist reads as on the trip screen", () => {
  const base = {
    checks: PICKUP_CHECK_CODES.map((code) => ({ code, passed: code !== "visible_defects" })),
    evidenceFileIds: [],
    failureNote: null,
    completedAt: null,
    completedBy: null,
    escalationId: null,
    signOffPrompt: "GRIDGO partner! Quality check, done! Salamat po!",
  };

  it("names the failed check as a failure, without ever printing its code", () => {
    const summary = checklistSummary({
      pickupChecklist: { ...base, status: "failed_escalated" },
    });
    expect(summary).toBe("There are visible defects.");
    expect(summary).not.toMatch(/visible_defects/);
  });

  it("lists several failures as a sentence rather than a comma soup", () => {
    const summary = checklistSummary({
      pickupChecklist: {
        ...base,
        status: "failed_escalated",
        checks: base.checks.map((check) =>
          check.code === "documentation" ? { ...check, passed: false } : check,
        ),
      },
    });
    expect(summary).toBe(
      "There are visible defects and the paperwork is missing or does not match.",
    );
  });

  it("tells a rider whose escalation was answered to run all six again", () => {
    expect(
      checklistSummary({ pickupChecklist: { ...base, status: "escalation_resolved" } }),
    ).toMatch(/again/i);
  });

  it("says nothing when there is nothing to say", () => {
    expect(checklistSummary({ pickupChecklist: null })).toBeNull();
    expect(checklistSummary({ pickupChecklist: { ...base, status: "not_started" } })).toBeNull();
  });

  it("treats a migrated pass as a pass", () => {
    expect(
      checklistSummary({ pickupChecklist: { ...base, status: "legacy_passed" } }),
    ).toMatch(/passed/i);
  });
});


describe("joint pickup eligibility", () => {
  it("opens checks only after a rider accepts, including a resolved retry", () => {
    expect(canRunPickupChecks({ state: "rider_assigned", pickupChecklist: null })).toBe(true);
    for (const state of ["ready_for_dispatch", "production", "picked_up", "out_for_delivery"]) {
      expect(canRunPickupChecks({ state, pickupChecklist: null })).toBe(false);
    }
  });
  it("keeps a failed pickup blocked until Operations resolves it", () => {
    const record = { status: "failed_escalated" } as NonNullable<import("@/lib/api").Order["pickupChecklist"]>;
    expect(canRunPickupChecks({ state: "rider_assigned", pickupChecklist: record })).toBe(false);
    expect(canRunPickupChecks({ state: "rider_assigned", pickupChecklist: { ...record, status: "escalation_resolved" } })).toBe(true);
  });
});
