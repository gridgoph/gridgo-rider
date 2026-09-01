import {
  ACTIVE_TRIP_STATES,
  activeStopKind,
  dropoffLabel,
  endsAtOffice,
  feeDistanceLabel,
  formatRelativeAt,
  isActiveTripState,
  isBalanceConfirmed,
  isPickupCleared,
  isTransportBlocked,
  issueWindowLabel,
  orderStateChip,
  orderStateLabel,
  owesSignOff,
  pickupLabel,
  primaryActionLabel,
  selectActiveTrip,
  selectOffers,
  shouldShareLocation,
  signOffPrompt,
  stopLatLng,
  timelineActorLabel,
  tripPhase,
  unreadCount,
  zoneLabel,
} from "@/lib/riderOrder";
import type { Order, PickupChecklistRecord, PickupChecklistStatus } from "@/lib/api";
import { PICKUP_CHECK_CODES } from "@/lib/pickupChecklist";

const SIGN_OFF = "GRIDGO partner! Quality check, done! Salamat po!";

function checklist(
  status: PickupChecklistStatus,
  failed: string[] = [],
): PickupChecklistRecord {
  return {
    status,
    checks: PICKUP_CHECK_CODES.map((code) => ({ code, passed: !failed.includes(code) })),
    evidenceFileIds: [],
    failureNote: null,
    completedAt: null,
    completedBy: null,
    escalationId: null,
    signOffPrompt: SIGN_OFF,
  };
}

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
    subtotalMinor: 77000,
    deliveryFeeMinor: 2500,
    deliveryDistanceMeters: 3101,
    totalMinor: 79500,
    downpaymentMinor: 59625,
    balanceMinor: 19875,
    paymentMethod: "qr_manual",
    paymentStatus: "authorized",
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

describe("tripPhase ladder", () => {
  it("walks pickup checks → start delivery → delivery proof → complete", () => {
    expect(tripPhase(order({ id: "a", state: "rider_assigned", riderId: "r1" }))).toBe(
      "pickup_checks",
    );
    expect(tripPhase(order({ id: "a", state: "picked_up", riderId: "r1" }))).toBe(
      "start_delivery",
    );
    expect(tripPhase(order({ id: "a", state: "out_for_delivery", riderId: "r1" }))).toBe(
      "delivery_proof",
    );
    expect(tripPhase(order({ id: "a", state: "issue_window_open", riderId: "r1" }))).toBe(
      "complete",
    );
    expect(tripPhase(null)).toBe("idle");
  });

  it("offers no next step at all while a failed check is with Operations", () => {
    const blocked = order({
      id: "a",
      state: "rider_assigned",
      riderId: "r1",
      pickupChecklist: checklist("failed_escalated", ["visible_defects"]),
    });
    expect(isTransportBlocked(blocked)).toBe(true);
    expect(tripPhase(blocked)).toBe("pickup_blocked");
    // The one phase with no primary action: a yellow button here would offer a
    // move the business has just refused.
    expect(primaryActionLabel("pickup_blocked")).toBeNull();
  });

  it("puts the rider back through all six once Operations has answered", () => {
    const resolved = order({
      id: "a",
      state: "rider_assigned",
      riderId: "r1",
      pickupChecklist: checklist("escalation_resolved", ["visible_defects"]),
    });
    expect(isTransportBlocked(resolved)).toBe(false);
    expect(tripPhase(resolved)).toBe("pickup_checks");
  });

  it("keeps the rider at the shop's end of the map until they set off", () => {
    expect(activeStopKind("pickup_checks")).toBe("pickup");
    expect(activeStopKind("pickup_blocked")).toBe("pickup");
    expect(activeStopKind("start_delivery")).toBe("dropoff");
    expect(activeStopKind("delivery_proof")).toBe("dropoff");
    expect(activeStopKind("complete")).toBeNull();
  });
});

describe("pickup clearance", () => {
  it("treats a passed and a legacy-passed checklist as cleared", () => {
    expect(isPickupCleared({ pickupChecklist: checklist("passed") })).toBe(true);
    expect(isPickupCleared({ pickupChecklist: checklist("legacy_passed") })).toBe(true);
    expect(isPickupCleared({ pickupChecklist: checklist("not_started") })).toBe(false);
    expect(isPickupCleared({ pickupChecklist: null })).toBe(false);
  });
});

describe("the spoken sign-off", () => {
  it("is owed from the checks passing until the rider leaves the shop", () => {
    const atShop = order({
      id: "a",
      state: "picked_up",
      pickupChecklist: checklist("passed"),
    });
    expect(owesSignOff(atShop)).toBe(true);
    expect(signOffPrompt(atShop)).toBe(SIGN_OFF);

    // Gone once the wheels turn: nothing records that it was said, so a card
    // still asking would nag about something the app cannot know either way.
    expect(owesSignOff({ ...atShop, state: "out_for_delivery" })).toBe(false);
    // And never before the checks pass.
    expect(
      owesSignOff({ ...atShop, pickupChecklist: checklist("failed_escalated") }),
    ).toBe(false);
  });

  it("takes the words from the server rather than hard-coding them", () => {
    expect(signOffPrompt({ pickupChecklist: null })).toBeNull();
    expect(
      signOffPrompt({ pickupChecklist: { ...checklist("passed"), signOffPrompt: "  " } }),
    ).toBeNull();
  });
});

describe("the client's digital balance gates delivery", () => {
  it("is confirmed only when Operations says so", () => {
    const installment = {
      amountMinor: 19875,
      method: "qr_manual",
      submittedAt: null,
      confirmedAt: null,
      confirmationSource: null,
    };
    expect(
      isBalanceConfirmed({
        payments: { balance: { ...installment, status: "confirmed" } },
      }),
    ).toBe(true);
    // Migrated orders carry their own confirmed marker and must not be blocked.
    expect(
      isBalanceConfirmed({
        payments: { balance: { ...installment, status: "legacy_confirmed" } },
      }),
    ).toBe(true);
    expect(
      isBalanceConfirmed({
        payments: { balance: { ...installment, status: "pending_confirmation" } },
      }),
    ).toBe(false);
    expect(isBalanceConfirmed({ payments: null })).toBe(false);
  });
});

describe("orderStateChip", () => {
  it("says do-not-transport rather than head-to-pickup on a blocked job", () => {
    const chip = orderStateChip({
      state: "rider_assigned",
      pickupChecklist: checklist("failed_escalated", ["visible_defects"]),
    });
    expect(chip.label).toBe("Do not transport");
    expect(chip.tone).toBe("error");
    // Icon + label as well as colour: the chip has to read in greyscale.
    expect(chip.icon).toBe("circle-x");
  });

  it("never puts a raw state string on screen", () => {
    for (const state of [
      "ready_for_dispatch",
      "rider_assigned",
      "picked_up",
      "out_for_delivery",
      "issue_window_open",
      "completed",
      "payout_released",
      "some_future_state",
    ]) {
      expect(orderStateChip({ state, pickupChecklist: null }).label).not.toMatch(/_/);
    }
  });
});

describe("selectOffers / selectActiveTrip", () => {
  const pool = [
    order({
      id: "offer",
      state: "ready_for_dispatch",
      riderId: null,
      updatedAt: "2026-08-02T00:00:00Z",
    }),
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

describe("distance band and issue window copy", () => {
  it("says what the fee was measured over, without pretending it is the ride", () => {
    expect(feeDistanceLabel(3101)).toBe("3.1 km apart");
    expect(feeDistanceLabel(420)).toBe("400 m apart");
    expect(feeDistanceLabel(null)).toBeNull();
    expect(feeDistanceLabel(undefined)).toBeNull();
  });

  it("reads the global issue window back in plain words", () => {
    expect(issueWindowLabel(24)).toBe("24 hours");
    expect(issueWindowLabel(48)).toBe("2 days");
    expect(issueWindowLabel(1)).toBe("1 hour");
    expect(issueWindowLabel(36)).toBe("36 hours");
    // Unknown is a real state — the setting is fetched, so it can fail.
    expect(issueWindowLabel(null)).toBe("a short while");
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

/**
 * A collected job ends on GRIDGO's own shelf, not in anybody's hands.
 *
 * The rider still carries it — from the shop to the office counter — but there
 * is nobody at the far end to hand it to, so nothing about the client's money
 * is theirs to wait on. Held against the balance, a rider stood at our own
 * office with a package and no way to put it down.
 */
describe("a collected job", () => {
  const collected = (state: string) =>
    order({ id: "ord_office", state, fulfillmentMode: "pickup" });

  it("is recognised by where it ends, not by who is carrying it", () => {
    expect(endsAtOffice(collected("out_for_delivery"))).toBe(true);
    expect(endsAtOffice(order({ id: "ord_door", state: "out_for_delivery" }))).toBe(false);
  });

  it("names the drop-off as our counter rather than a delivery", () => {
    expect(orderStateLabel("awaiting_collection")).toBe("Left at GRIDGO Office");
    expect(orderStateLabel("awaiting_collection")).not.toMatch(/_/);
    expect(orderStateChip(collected("awaiting_collection")).tone).toBe("success");
  });

  it("finishes the rider's trip once it is on the shelf", () => {
    // The order is not over — the client has not collected it — but the
    // rider's part of it is, and leaving them on an active trip would keep
    // them from taking the next job.
    expect(tripPhase(collected("awaiting_collection"))).toBe("complete");
  });

  it("asks the rider to confirm a drop-off, not a delivery", () => {
    expect(primaryActionLabel("delivery_proof", true)).toBe("Confirm drop-off");
    expect(primaryActionLabel("delivery_proof")).toBe("Confirm delivery");
  });
});
