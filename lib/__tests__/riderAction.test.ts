import { riderAction } from "@/lib/riderAction";
import type { TripPhase } from "@/lib/riderOrder";

const ORDER = "ord_1";

const ALL_PHASES: TripPhase[] = [
  "pickup_checks",
  "pickup_blocked",
  "start_delivery",
  "delivery_proof",
  "complete",
  "idle",
];

describe("the raised centre disc is an action, not a destination", () => {
  it("names the next step of the job with a verb, and routes to it", () => {
    expect(riderAction("pickup_checks", ORDER)).toMatchObject({
      label: "Check it",
      route: "/trip/pickup",
      needsOrderId: true,
    });
    expect(riderAction("start_delivery", ORDER)).toMatchObject({
      label: "Set off",
      route: "/trip/start",
    });
    expect(riderAction("delivery_proof", ORDER)).toMatchObject({
      label: "Hand over",
      route: "/trip/delivery",
    });
  });

  it("sends a blocked rider to where the instruction lands, not back to the trip", () => {
    // The disc is never disabled, but it must not invite transport the business
    // has refused — and it must not reopen the screen the rider is already on,
    // which is where the hold is displayed. What they are waiting for is an
    // alert from Operations.
    const action = riderAction("pickup_blocked", ORDER);
    expect(action.kind).toBe("on-hold");
    expect(action.route).toBe("/alerts");
    expect(action.needsOrderId).toBe(false);
    expect(action.spoken).toMatch(/hold/i);
  });

  it("does not offer work to an account Operations has not accredited", () => {
    // "Find work" on a disc belonging to someone who cannot take any is the
    // app promising something it knows the server will refuse.
    for (const phase of ALL_PHASES) {
      const action = riderAction(phase, ORDER, false);
      expect(action.kind).toBe("not-accredited");
      expect(action.label).not.toMatch(/find work/i);
      expect(action.spoken).toMatch(/accredited/i);
    }
  });

  it("offers the only move a rider without a job has", () => {
    for (const phase of ["idle", "complete"] as TripPhase[]) {
      expect(riderAction(phase, ORDER)).toMatchObject({
        kind: "find-work",
        route: "/(tabs)/offers",
        needsOrderId: false,
      });
    }
    expect(riderAction("pickup_checks", null).kind).toBe("find-work");
  });

  it("is never dead: every phase produces a label and a route", () => {
    for (const phase of ALL_PHASES) {
      const action = riderAction(phase, ORDER);
      expect(action.label.length).toBeGreaterThan(0);
      // Short enough to fit a 10px label box under a 56dp disc.
      expect(action.label.length).toBeLessThanOrEqual(10);
      expect(action.route.length).toBeGreaterThan(0);
    }
  });

  it("spells the action out for a screen reader, since one word is not enough", () => {
    for (const phase of ALL_PHASES) {
      const action = riderAction(phase, ORDER);
      expect(action.spoken.length).toBeGreaterThan(action.label.length);
      expect(action.spoken).toMatch(/\.$/);
    }
  });

  it("uses no snake_case or identifier in anything the rider reads", () => {
    for (const phase of ALL_PHASES) {
      const action = riderAction(phase, ORDER);
      expect(action.label).not.toMatch(/[_]/);
      expect(action.spoken).not.toMatch(/[_]/);
    }
  });
});
