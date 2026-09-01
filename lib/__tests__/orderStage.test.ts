import type { PickupChecklistRecord, PickupChecklistStatus } from "@/lib/api";
import { ORDER_STAGES, orderStage, stageState } from "@/lib/orderStage";
import { PICKUP_CHECK_CODES } from "@/lib/pickupChecklist";

function checklist(status: PickupChecklistStatus): PickupChecklistRecord {
  return {
    status,
    checks: PICKUP_CHECK_CODES.map((code) => ({ code, passed: true })),
    evidenceFileIds: [],
    failureNote: null,
    completedAt: null,
    completedBy: null,
    escalationId: null,
    signOffPrompt: "GRIDGO partner! Quality check, done! Salamat po!",
  };
}

describe("the four stages are the rider's own, not the order's whole life", () => {
  it("names four steps, in plain language, short enough for a 32dp disc", () => {
    expect(ORDER_STAGES).toHaveLength(4);
    expect(ORDER_STAGES.map((stage) => stage.code)).toEqual([
      "assigned",
      "checked",
      "on_the_way",
      "delivered",
    ]);
    for (const stage of ORDER_STAGES) {
      expect(stage.label).not.toMatch(/_/);
      expect(stage.label.length).toBeLessThanOrEqual(11);
      // The label is too terse to read aloud on its own.
      expect(stage.spoken.length).toBeGreaterThanOrEqual(stage.label.length);
    }
  });
});

describe("where a job actually is", () => {
  it("walks the ladder as the order moves", () => {
    expect(orderStage({ state: "rider_assigned", pickupChecklist: null }).index).toBe(0);
    expect(orderStage({ state: "picked_up", pickupChecklist: checklist("passed") }).index).toBe(1);
    expect(orderStage({ state: "out_for_delivery", pickupChecklist: null }).index).toBe(2);
    for (const state of [
      "awaiting_collection",
      "delivered",
      "issue_window_open",
      "completed",
      "payout_released",
    ]) {
      expect(orderStage({ state, pickupChecklist: null }).index).toBe(3);
    }
  });

  it("marks a cancelled job as blocked at the last rider step it reached", () => {
    const cancelled = orderStage({
      state: "cancelled",
      pickupChecklist: null,
      timeline: [
        { state: "rider_assigned" },
        { state: "picked_up" },
        { state: "cancelled" },
      ],
    });
    expect(cancelled.blocked).toBe(true);
    expect(cancelled.index).toBe(1);
    expect(cancelled.summary).toBe("Cancelled");
  });

  it("claims no step at all before the job reaches a rider", () => {
    // Saying "assigned" for an open offer would be the bar inventing a step.
    expect(orderStage({ state: "ready_for_dispatch", pickupChecklist: null }).index).toBe(-1);
    expect(orderStage({ state: "production", pickupChecklist: null }).index).toBe(-1);
  });

  it("shows a failed check as a hold, not as quiet progress", () => {
    const held = orderStage({
      state: "rider_assigned",
      pickupChecklist: checklist("failed_escalated"),
    });
    expect(held.blocked).toBe(true);
    expect(held.index).toBe(0);
    expect(held.summary).toMatch(/held/i);
  });

  it("summarises every state without printing one", () => {
    for (const state of [
      "ready_for_dispatch",
      "rider_assigned",
      "picked_up",
      "out_for_delivery",
      "delivered",
      "completed",
      "cancelled",
      "awaiting_collection",
      "something_new",
    ]) {
      expect(orderStage({ state, pickupChecklist: null }).summary).not.toMatch(/_/);
    }
  });
});

describe("how each step draws", () => {
  const onTheWay = orderStage({ state: "out_for_delivery", pickupChecklist: null });

  it("marks what is done, what is now, and what is still ahead", () => {
    expect(stageState(0, onTheWay)).toBe("done");
    expect(stageState(1, onTheWay)).toBe("done");
    expect(stageState(2, onTheWay)).toBe("current");
    expect(stageState(3, onTheWay)).toBe("upcoming");
  });

  it("marks the held step as blocked rather than current", () => {
    const held = orderStage({
      state: "rider_assigned",
      pickupChecklist: checklist("failed_escalated"),
    });
    expect(stageState(0, held)).toBe("blocked");
    expect(stageState(1, held)).toBe("upcoming");
  });

  it("leaves every step ahead when no rider has the job", () => {
    const open = orderStage({ state: "ready_for_dispatch", pickupChecklist: null });
    for (let index = 0; index < ORDER_STAGES.length; index += 1) {
      expect(stageState(index, open)).toBe("upcoming");
    }
  });
});
