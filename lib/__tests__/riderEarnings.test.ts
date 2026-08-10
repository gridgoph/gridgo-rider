import type { Order } from "@/lib/api";
import {
  deliveredAt,
  earningsDayLabel,
  isDeliveredState,
  isSameLocalDay,
  summariseEarnings,
} from "@/lib/riderEarnings";

const NOW = new Date("2026-08-10T14:00:00+08:00").getTime();

function order(patch: Partial<Order>): Order {
  return {
    id: "ord",
    clientId: "user_client",
    supplierId: "user_supplier",
    riderId: "user_rider",
    state: "completed",
    productId: "prod",
    title: "Flyers x500",
    quantity: 5,
    size: "A5",
    material: "matte",
    deadline: null,
    address: "Matina Crossing, Davao City",
    zone: "davao_south",
    totalMinor: 50_000,
    deliveryFeeMinor: 10_000,
    paymentMethod: "pilot_credit",
    paymentStatus: "authorized",
    codEligible: false,
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-10T01:00:00+08:00",
    updatedAt: "2026-08-10T10:00:00+08:00",
    timeline: [],
    ...patch,
  };
}

describe("what a shift is worth", () => {
  it("counts only this rider's delivered jobs", () => {
    const summary = summariseEarnings(
      [
        order({ id: "mine", deliveryFeeMinor: 10_000 }),
        order({ id: "theirs", riderId: "user_other", deliveryFeeMinor: 99_000 }),
        order({ id: "in-flight", state: "out_for_delivery", deliveryFeeMinor: 88_000 }),
      ],
      "user_rider",
      NOW,
    );

    expect(summary.entries.map((e) => e.orderId)).toEqual(["mine"]);
    expect(summary.todayMinor).toBe(10_000);
    expect(summary.todayCount).toBe(1);
    expect(summary.allTimeMinor).toBe(10_000);
  });

  it("treats an accepted job as no income at all", () => {
    expect(isDeliveredState("rider_assigned")).toBe(false);
    expect(isDeliveredState("picked_up")).toBe(false);
    expect(isDeliveredState("delivered")).toBe(true);
    expect(isDeliveredState("issue_window_open")).toBe(true);
    expect(isDeliveredState("payout_released")).toBe(true);
  });

  it("separates today from the rest of the account", () => {
    const summary = summariseEarnings(
      [
        order({ id: "today", updatedAt: "2026-08-10T09:00:00+08:00", deliveryFeeMinor: 12_000 }),
        order({
          id: "yesterday",
          updatedAt: "2026-08-09T09:00:00+08:00",
          deliveryFeeMinor: 15_000,
        }),
      ],
      "user_rider",
      NOW,
    );

    expect(summary.todayMinor).toBe(12_000);
    expect(summary.allTimeMinor).toBe(27_000);
    // Newest first.
    expect(summary.entries.map((e) => e.orderId)).toEqual(["today", "yesterday"]);
  });

  it("never adds the client's cash to the rider's fees", () => {
    const summary = summariseEarnings(
      [
        order({
          id: "cod",
          paymentMethod: "cod",
          paymentStatus: "collected",
          totalMinor: 45_000,
          deliveryFeeMinor: 10_000,
        }),
      ],
      "user_rider",
      NOW,
    );

    // The fee is the rider's; the ₱550 is GRIDGO's money in their pocket.
    expect(summary.todayMinor).toBe(10_000);
    expect(summary.cashToHandInMinor).toBe(55_000);
    expect(summary.entries[0].cashCollectedMinor).toBe(55_000);
    expect(summary.entries[0].cashOutstanding).toBe(true);
  });

  it("stops counting cash once Operations has reconciled it", () => {
    const summary = summariseEarnings(
      [
        order({
          paymentMethod: "cod",
          paymentStatus: "reconciled",
          totalMinor: 45_000,
        }),
      ],
      "user_rider",
      NOW,
    );

    expect(summary.cashToHandInMinor).toBe(0);
    expect(summary.entries[0].cashOutstanding).toBe(false);
  });

  it("is empty, not broken, when the rider has no id yet", () => {
    const summary = summariseEarnings([order({})], null, NOW);
    expect(summary.entries).toEqual([]);
    expect(summary.todayMinor).toBe(0);
    expect(summary.cashToHandInMinor).toBe(0);
  });

  it("dates a delivery from the timeline, not from a later edit", () => {
    const withTimeline = order({
      state: "completed",
      updatedAt: "2026-08-10T18:00:00+08:00",
      timeline: [
        { at: "2026-08-08T10:00:00+08:00", state: "delivered", by: "user_rider", note: "" },
        { at: "2026-08-10T18:00:00+08:00", state: "completed", by: "user_ops", note: "" },
      ],
    });

    expect(deliveredAt(withTimeline)).toBe("2026-08-08T10:00:00+08:00");
    // So it does not land in today's total two days later.
    expect(summariseEarnings([withTimeline], "user_rider", NOW).todayMinor).toBe(0);
  });
});

describe("dates a rider can read", () => {
  it("says Today and Yesterday before it says a date", () => {
    expect(earningsDayLabel("2026-08-10T09:00:00+08:00", NOW)).toBe("Today");
    expect(earningsDayLabel("2026-08-09T09:00:00+08:00", NOW)).toBe("Yesterday");
    expect(earningsDayLabel("2026-08-01T09:00:00+08:00", NOW)).toMatch(/Aug/);
  });

  it("survives a timestamp the server never wrote", () => {
    expect(earningsDayLabel("", NOW)).toBe("");
    expect(isSameLocalDay("not a date", NOW)).toBe(false);
  });
});
