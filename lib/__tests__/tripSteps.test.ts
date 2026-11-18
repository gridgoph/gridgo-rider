import type { Order } from "@/lib/api";
import { currentTripStep, tripRail, tripStepAction, tripStepNote, TRIP_STEPS } from "@/lib/tripSteps";

function trip(partial: Partial<Order> = {}): Order {
  return { id: "ord_1", state: "rider_assigned", fulfillmentMode: "delivery", pickupChecklist: null, ...partial } as Order;
}

const milestone = (code: string, status: string) => ({ code, label: code, status, at: null });

describe("the four steps", () => {
  it("are to shop, check, to client, hand over", () => {
    expect(TRIP_STEPS.map((step) => step.label)).toEqual(["To shop", "Check", "To client", "Hand over"]);
  });

  it("starts on the way to the shop, and moves to the check on arrival", () => {
    expect(currentTripStep(trip(), "pickup_checks")).toBe("to_shop");
    expect(currentTripStep(trip(), "pickup_checks", { shop: true, destination: false })).toBe("check");
    expect(
      currentTripStep(trip({ deliveryMilestones: [milestone("at_shop", "completed")] } as never), "pickup_checks"),
    ).toBe("check");
  });

  it("stays on the check while the shop packs, signs, or Operations holds it", () => {
    for (const phase of ["pickup_pack", "pickup_sign", "pickup_blocked"] as const) {
      expect(currentTripStep(trip(), phase)).toBe("check");
    }
  });

  it("rides to the client after pick-up, and hands over on arrival", () => {
    expect(currentTripStep(trip(), "start_delivery")).toBe("to_client");
    expect(currentTripStep(trip(), "delivery_proof")).toBe("to_client");
    expect(currentTripStep(trip(), "delivery_proof", { shop: true, destination: true })).toBe("hand_over");
    expect(
      currentTripStep(trip({ deliveryMilestones: [milestone("arrived", "completed")] } as never), "delivery_proof"),
    ).toBe("hand_over");
  });

  it("is done once delivered, and nothing with no job", () => {
    expect(currentTripStep(trip(), "complete")).toBe("done");
    expect(currentTripStep(null, "idle")).toBeNull();
  });
});

describe("the rail", () => {
  it("marks steps before as done and the current one as now", () => {
    expect(tripRail("to_client").map((step) => step.status)).toEqual(["done", "done", "now", "upcoming"]);
  });

  it("holds the current step while Operations has the job", () => {
    expect(tripRail("check", true).map((step) => step.status)).toEqual(["done", "held", "upcoming", "upcoming"]);
  });

  it("is all done once delivered", () => {
    expect(tripRail("done").every((step) => step.status === "done")).toBe(true);
  });
});

describe("the one button", () => {
  it("records arrival at the shop, then opens the check screens in order", () => {
    expect(tripStepAction(trip(), "pickup_checks", "to_shop")).toEqual({ kind: "arrive_shop", label: "I'm at the shop" });
    expect(tripStepAction(trip(), "pickup_checks", "check")).toMatchObject({ kind: "open", route: "/trip/pickup" });
    expect(tripStepAction(trip(), "pickup_pack", "check")).toMatchObject({ kind: "open", route: "/trip/pack" });
    expect(tripStepAction(trip(), "pickup_sign", "check")).toMatchObject({ kind: "open", route: "/trip/handoff" });
  });

  it("offers nothing to tap while a failed check is held", () => {
    expect(tripStepAction(trip(), "pickup_blocked", "check")).toEqual({ kind: "none" });
    expect(tripStepNote(trip(), "pickup_blocked", "check")).toMatch(/Operations has it/);
  });

  it("starts the delivery, records arrival, then opens the handover", () => {
    expect(tripStepAction(trip(), "start_delivery", "to_client")).toMatchObject({ kind: "open", route: "/trip/start" });
    expect(tripStepAction(trip(), "delivery_proof", "to_client")).toEqual({
      kind: "arrive_destination",
      label: "I'm at the client",
      then: "/trip/delivery",
    });
    expect(tripStepAction(trip(), "delivery_proof", "hand_over")).toEqual({
      kind: "open",
      label: "Hand over and sign",
      route: "/trip/delivery",
    });
  });

  it("names GRIDGO Office on a job that ends there", () => {
    const office = trip({ fulfillmentMode: "pickup" });
    expect(tripStepAction(office, "delivery_proof", "to_client")).toMatchObject({ label: "I'm at GRIDGO Office" });
    expect(tripStepAction(office, "delivery_proof", "hand_over")).toMatchObject({ label: "Drop it off" });
  });
});
