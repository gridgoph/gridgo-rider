import {
  ACTIVE_TRIP_STATES,
  buildFailureNote,
  codAmountDueMinor,
  activeStopKind,
  dropoffLabel,
  FAILURE_REASONS,
  failureOutcomeConfirm,
  formatAttemptAt,
  formatRelativeAt,
  isActiveTripState,
  isCodCollected,
  isCodOrder,
  orderStateLabel,
  pickupLabel,
  primaryActionLabel,
  selectActiveTrip,
  selectOffers,
  shouldShareLocation,
  stopLatLng,
  suggestedOutcome,
  timelineActorLabel,
  tripPhase,
  unreadCount,
  zoneLabel,
} from "@/lib/riderOrder";
import type { Order } from "@/lib/api";

function order(partial: Partial<Order> & Pick<Order, "id" | "state">): Order {
  return {
    clientId: "user_client",
    supplierId: "user_supplier",
    riderId: null,
    productId: "prod_flyer",
    title: "Test",
    quantity: 1,
    size: "A5",
    material: "matte",
    deadline: null,
    address: "Matina Crossing, Davao City",
    zone: "davao_south",
    totalMinor: 85000,
    deliveryFeeMinor: 10000,
    paymentMethod: "pilot_credit",
    paymentStatus: "authorized",
    codEligible: true,
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    timeline: [],
    ...partial,
  };
}

describe("orderStateLabel", () => {
  it("maps every active state to plain language, never snake_case", () => {
    for (const state of ACTIVE_TRIP_STATES) {
      const label = orderStateLabel(state);
      expect(label).not.toMatch(/_/);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("labels ready_for_dispatch as a pickup invitation", () => {
    expect(orderStateLabel("ready_for_dispatch")).toBe("Ready for pickup");
  });
});

describe("zoneLabel", () => {
  it("humanises known zones", () => {
    expect(zoneLabel("davao_south")).toBe("Davao South");
  });

  it("falls back without inventing an ETA", () => {
    expect(zoneLabel("custom_zone")).toBe("custom zone");
  });
});

describe("COD money and eligibility", () => {
  it("adds total and delivery fee for the amount due", () => {
    expect(codAmountDueMinor({ totalMinor: 85000, deliveryFeeMinor: 10000 })).toBe(95000);
  });

  it("treats only paymentMethod=cod as a cash job", () => {
    expect(isCodOrder({ paymentMethod: "cod" })).toBe(true);
    expect(isCodOrder({ paymentMethod: "pilot_credit" })).toBe(false);
    expect(isCodOrder({ paymentMethod: null })).toBe(false);
  });

  it("requires collection before a COD delivery can complete", () => {
    const unpaid = order({
      id: "1",
      state: "out_for_delivery",
      paymentMethod: "cod",
      paymentStatus: "unpaid",
    });
    expect(isCodCollected(unpaid)).toBe(false);
    expect(tripPhase(unpaid)).toBe("collect_cod");
    expect(primaryActionLabel(tripPhase(unpaid))).toBe("Record cash collection");

    const paid = order({
      id: "1",
      state: "out_for_delivery",
      paymentMethod: "cod",
      paymentStatus: "collected",
    });
    expect(isCodCollected(paid)).toBe(true);
    expect(tripPhase(paid)).toBe("delivery_proof");
  });

  it("skips the COD gate for pilot credit", () => {
    const credit = order({
      id: "1",
      state: "out_for_delivery",
      paymentMethod: "pilot_credit",
      paymentStatus: "authorized",
    });
    expect(tripPhase(credit)).toBe("delivery_proof");
  });
});

describe("tripPhase ladder", () => {
  it("walks pickup → start delivery → delivery proof", () => {
    expect(tripPhase(order({ id: "a", state: "rider_assigned", riderId: "r1" }))).toBe("pickup");
    expect(tripPhase(order({ id: "a", state: "picked_up", riderId: "r1" }))).toBe("start_delivery");
    expect(tripPhase(order({ id: "a", state: "out_for_delivery", riderId: "r1" }))).toBe(
      "delivery_proof",
    );
    expect(tripPhase(order({ id: "a", state: "issue_window_open", riderId: "r1" }))).toBe(
      "complete",
    );
    expect(tripPhase(null)).toBe("idle");
  });
});

describe("selectOffers / selectActiveTrip", () => {
  const pool = [
    order({ id: "offer", state: "ready_for_dispatch", riderId: null, updatedAt: "2026-08-02T00:00:00Z" }),
    order({
      id: "mine",
      state: "picked_up",
      riderId: "user_rider",
      updatedAt: "2026-08-03T00:00:00Z",
    }),
    order({
      id: "other",
      state: "rider_assigned",
      riderId: "someone_else",
      updatedAt: "2026-08-04T00:00:00Z",
    }),
  ];

  it("lists only open dispatch offers", () => {
    expect(selectOffers(pool).map((o) => o.id)).toEqual(["offer"]);
  });

  it("picks this rider's active trip only", () => {
    expect(selectActiveTrip(pool, "user_rider")?.id).toBe("mine");
    expect(selectActiveTrip(pool, "nobody")).toBeNull();
  });
});

describe("location sharing window", () => {
  it("shares only while the package is with the rider en route", () => {
    expect(shouldShareLocation("rider_assigned")).toBe(false);
    expect(shouldShareLocation("picked_up")).toBe(true);
    expect(shouldShareLocation("out_for_delivery")).toBe(true);
    expect(shouldShareLocation("issue_window_open")).toBe(false);
  });
});

describe("timeline and alerts helpers", () => {
  it("names the current rider You", () => {
    expect(timelineActorLabel("user_rider", "user_rider")).toBe("You");
    expect(timelineActorLabel("user_supplier", "user_rider")).toBe("Supplier");
    expect(timelineActorLabel("system")).toBe("System");
  });

  it("counts unread alerts", () => {
    expect(unreadCount([{ read: true }, { read: false }, { read: false }])).toBe(2);
  });

  it("formats relative times", () => {
    const now = Date.parse("2026-08-08T12:00:00.000Z");
    expect(formatRelativeAt("2026-08-08T11:59:30.000Z", now)).toBe("Just now");
    expect(formatRelativeAt("2026-08-08T11:45:00.000Z", now)).toBe("15 min ago");
    expect(formatRelativeAt("2026-08-08T10:00:00.000Z", now)).toBe("2h ago");
  });

  it("folds a failed attempt into one plain-language note", () => {
    expect(
      buildFailureNote({
        reasonId: "unavailable",
        outcome: "retry",
        contacted: false,
        nextAttemptAt: new Date("2026-08-10T07:00:00.000Z"),
        note: "  Guard says they are back at three  ",
      }),
    ).toBe(
      "Nobody at the address. Client did not answer the phone. Trying again " +
        formatAttemptAt(new Date("2026-08-10T07:00:00.000Z")) +
        ". Guard says they are back at three",
    );

    expect(buildFailureNote({ reasonId: "refused", outcome: "return" })).toBe(
      "Client refused the package. Package returned to the supplier",
    );
  });

  it("never leaks a reason id into the note", () => {
    for (const reason of FAILURE_REASONS) {
      const note = buildFailureNote({ reasonId: reason.id, outcome: "retry" });
      expect(note).not.toMatch(/_/);
      expect(note).toContain(reason.label);
    }
  });
});

describe("isActiveTripState", () => {
  it("accepts only mid-job states", () => {
    expect(isActiveTripState("rider_assigned")).toBe(true);
    expect(isActiveTripState("ready_for_dispatch")).toBe(false);
    expect(isActiveTripState("issue_window_open")).toBe(false);
  });
});

describe("stop coordinates and labels", () => {
  it("reads lat/lng from API stops and rejects invalids", () => {
    expect(stopLatLng({ lat: 7.064, lng: 125.6085, label: "Shop" })).toEqual({
      lat: 7.064,
      lng: 125.6085,
    });
    expect(stopLatLng({ lat: 99, lng: 0, label: "Bad" })).toBeNull();
    expect(stopLatLng(null)).toBeNull();
  });

  it("prefers API labels over generic copy", () => {
    const withStops = order({
      id: "1",
      state: "ready_for_dispatch",
      address: "Client street",
      pickup: { lat: 7, lng: 125, label: "PrintRight Davao" },
      dropoff: { lat: 7.1, lng: 125.1, label: "Matina Crossing" },
    });
    expect(pickupLabel(withStops)).toBe("PrintRight Davao");
    expect(dropoffLabel(withStops)).toBe("Matina Crossing");
    expect(pickupLabel(order({ id: "2", state: "ready_for_dispatch" }))).toBe(
      "Supplier print shop",
    );
  });
});

describe("a failed delivery outranks the delivery ladder", () => {
  const outForDelivery = order({ id: "a", state: "out_for_delivery", riderId: "r1" });

  it("routes back to the shop once a return is chosen", () => {
    expect(
      tripPhase(outForDelivery, { attemptCount: 1, outcome: "return", returnedAt: null }),
    ).toBe("returning");
    expect(primaryActionLabel("returning")).toBe("Confirm handover to supplier");
    expect(activeStopKind("returning")).toBe("pickup");
  });

  it("closes out once the package is back with the supplier", () => {
    expect(
      tripPhase(outForDelivery, {
        attemptCount: 1,
        outcome: "return",
        returnedAt: "2026-08-10T03:00:00.000Z",
      }),
    ).toBe("returned");
    expect(primaryActionLabel("returned")).toBeNull();
  });

  it("leaves the ladder alone when the rider is trying again", () => {
    expect(
      tripPhase(outForDelivery, { attemptCount: 2, outcome: "retry", returnedAt: null }),
    ).toBe("delivery_proof");
    expect(activeStopKind("delivery_proof")).toBe("dropoff");
  });

  it("outranks an uncollected cash gate — a returned package collects nothing", () => {
    const cod = order({
      id: "a",
      state: "out_for_delivery",
      paymentMethod: "cod",
      paymentStatus: "authorized",
    });
    expect(tripPhase(cod)).toBe("collect_cod");
    expect(tripPhase(cod, { attemptCount: 1, outcome: "return", returnedAt: null })).toBe(
      "returning",
    );
  });
});

describe("what usually follows each reason", () => {
  it("suggests another attempt only where one makes sense", () => {
    expect(suggestedOutcome("unavailable")).toBe("retry");
    expect(suggestedOutcome("access")).toBe("retry");
    expect(suggestedOutcome("wrong_address")).toBe("return");
    expect(suggestedOutcome("refused")).toBe("return");
  });

  it("asks a specific question before a return, never a bare are-you-sure", () => {
    const copy = failureOutcomeConfirm("return", "Bajada Print Hub");
    expect(copy.question).toContain("Bajada Print Hub");
    expect(copy.question).not.toMatch(/are you sure/i);
    expect(copy.body).toMatch(/client/i);
    expect(copy.confirmLabel).not.toBe("OK");
  });
});
