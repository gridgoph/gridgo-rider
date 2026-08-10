import { riderAction } from "@/lib/riderAction";
import type { TripPhase } from "@/lib/riderOrder";

const ORDER = "ord_1";

describe("the raised centre disc is an action, not a destination", () => {
  it("names the next step of the job with a verb, and routes to it", () => {
    expect(riderAction("pickup", ORDER)).toMatchObject({
      label: "Pick up",
      route: "/trip/pickup",
      needsOrderId: true,
    });
    expect(riderAction("start_delivery", ORDER)).toMatchObject({
      label: "Set off",
      route: "/trip/start",
    });
    expect(riderAction("collect_cod", ORDER)).toMatchObject({
      label: "Take cash",
      route: "/trip/cod",
    });
    expect(riderAction("delivery_proof", ORDER)).toMatchObject({
      label: "Hand over",
      route: "/trip/delivery",
    });
    expect(riderAction("returning", ORDER)).toMatchObject({
      label: "Return it",
      route: "/trip/handback",
    });
  });

  it("offers the only move a rider without a job has", () => {
    const closed: TripPhase[] = ["idle", "complete", "returned"];
    for (const phase of closed) {
      expect(riderAction(phase, ORDER)).toMatchObject({
        kind: "find-work",
        route: "/(tabs)/offers",
        needsOrderId: false,
      });
    }
    expect(riderAction("pickup", null).kind).toBe("find-work");
  });

  it("is never dead: every phase produces a label and a route", () => {
    const phases: TripPhase[] = [
      "pickup",
      "start_delivery",
      "collect_cod",
      "delivery_proof",
      "returning",
      "returned",
      "complete",
      "idle",
    ];
    for (const phase of phases) {
      const action = riderAction(phase, ORDER);
      expect(action.label.length).toBeGreaterThan(0);
      // Short enough to fit a 10px label box under a 56dp disc.
      expect(action.label.length).toBeLessThanOrEqual(10);
      expect(action.route.length).toBeGreaterThan(0);
    }
  });

  it("spells the action out for a screen reader, since one word is not enough", () => {
    for (const phase of ["pickup", "collect_cod", "delivery_proof"] as TripPhase[]) {
      const action = riderAction(phase, ORDER);
      expect(action.spoken.length).toBeGreaterThan(action.label.length);
      expect(action.spoken).toMatch(/\.$/);
    }
  });

  it("uses no snake_case or identifier in anything the rider reads", () => {
    const phases: TripPhase[] = [
      "pickup",
      "start_delivery",
      "collect_cod",
      "delivery_proof",
      "returning",
      "idle",
    ];
    for (const phase of phases) {
      const action = riderAction(phase, ORDER);
      expect(action.label).not.toMatch(/[_]/);
      expect(action.spoken).not.toMatch(/[_]/);
    }
  });
});
