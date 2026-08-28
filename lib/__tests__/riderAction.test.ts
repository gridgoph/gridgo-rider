import { riderAction, type RiderAction } from "@/lib/riderAction";
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

/**
 * The action for an accredited rider, who always has one.
 *
 * `riderAction` is nullable because an account still under review has no next
 * step at all, and every case below is about an account that does — so the
 * absence is a test failure here rather than something each assertion has to
 * narrow away.
 */
function actionFor(phase: TripPhase, orderId: string | null = ORDER): RiderAction {
  const action = riderAction(phase, orderId);
  if (!action) throw new Error(`expected an action for phase "${phase}"`);
  return action;
}

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
    const action = actionFor("pickup_blocked");
    expect(action.kind).toBe("on-hold");
    expect(action.route).toBe("/alerts");
    expect(action.needsOrderId).toBe(false);
    expect(action.spoken).toMatch(/hold/i);
  });

  it("gives an account Operations has not accredited no action at all", () => {
    // There is no disc for this rider, in any phase. It used to be an hourglass
    // labelled "Not yet" pointed at Offers — a dead end in the one slot the app
    // reserves for the thing that moves the rider forward, landing them on the
    // same review notice they had just left. A wait is not an action.
    for (const phase of ALL_PHASES) {
      expect(riderAction(phase, ORDER, false)).toBeNull();
    }
    // Nor with no job in hand, which is every unaccredited rider.
    expect(riderAction("idle", null, false)).toBeNull();
  });

  it("offers the only move a rider without a job has", () => {
    for (const phase of ["idle", "complete"] as TripPhase[]) {
      expect(riderAction(phase, ORDER)).toMatchObject({
        kind: "find-work",
        route: "/(tabs)/offers",
        needsOrderId: false,
      });
    }
    expect(actionFor("pickup_checks", null).kind).toBe("find-work");
  });

  it("is never dead: every phase an accredited rider can be in has a label and a route", () => {
    for (const phase of ALL_PHASES) {
      const action = actionFor(phase);
      expect(action.label.length).toBeGreaterThan(0);
      // Short enough to fit a 10px label box under a 56dp disc.
      expect(action.label.length).toBeLessThanOrEqual(10);
      expect(action.route.length).toBeGreaterThan(0);
    }
  });

  it("spells the action out for a screen reader, since one word is not enough", () => {
    for (const phase of ALL_PHASES) {
      const action = actionFor(phase);
      expect(action.spoken.length).toBeGreaterThan(action.label.length);
      expect(action.spoken).toMatch(/\.$/);
    }
  });

  it("uses no snake_case or identifier in anything the rider reads", () => {
    for (const phase of ALL_PHASES) {
      const action = actionFor(phase);
      expect(action.label).not.toMatch(/[_]/);
      expect(action.spoken).not.toMatch(/[_]/);
    }
  });
});
