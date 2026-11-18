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

describe("a cash job (gridgo-api#360)", () => {
  const cash = trip({
    cash: { method: "cash", version: 2, status: "reserved", noShowWaitSeconds: 600 },
    cashAmounts: { shopMinor: 40_000, collectMinor: 66_900, gridgoMinor: 19_780, riderMinor: 7_120 },
  } as never);

  it("pays the shop before the check, and says the exact amount", () => {
    expect(tripStepAction(cash, "pickup_checks", "check", "pay_shop")).toEqual({
      kind: "open",
      label: "Pay the shop",
      route: "/trip/shop-payment",
    });
    expect(tripStepNote(cash, "pickup_checks", "check", "pay_shop")).toMatch(/exactly ₱400\.00 in cash/);
  });

  it("opens the ordinary check once the shop is paid", () => {
    expect(tripStepAction(cash, "pickup_checks", "check", "carry")).toMatchObject({ route: "/trip/pickup" });
  });

  it("collects the exact cash at the door, then the client signs", () => {
    expect(tripStepAction(cash, "delivery_proof", "hand_over", "carry")).toMatchObject({
      label: "Collect cash and sign",
      route: "/trip/delivery",
    });
    expect(tripStepNote(cash, "delivery_proof", "hand_over", "carry")).toMatch(/exactly ₱669\.00/);
    expect(tripStepNote(cash, "start_delivery", "to_client", "carry")).toMatch(/collect exactly ₱669\.00 in cash/);
  });

  it("says the shop payment came back after a returned no-show", () => {
    expect(tripStepNote(cash, "complete", "done", "returned")).toMatch(/back in your wallet/);
  });

  it("leaves an online job's steps exactly as they were", () => {
    expect(tripStepAction(trip(), "pickup_checks", "check")).toMatchObject({ route: "/trip/pickup" });
    expect(tripStepAction(trip(), "pickup_checks", "check", "none")).toMatchObject({ route: "/trip/pickup" });
  });
});
