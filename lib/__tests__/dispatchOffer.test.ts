import type { Order } from "@/lib/api";
import {
  cargoLines,
  cargoTotalLabel,
  countdownLabel,
  countdownSpoken,
  currentOffer,
  offerDistanceLabel,
  offerFractionLeft,
  offerIdOf,
  offerSecondsLeft,
  serverClockOffsetMs,
} from "@/lib/dispatchOffer";

const NOW = Date.parse("2026-11-18T03:00:00.000Z");

function job(partial: Partial<Order> & Pick<Order, "id">): Order {
  return {
    state: "ready_for_dispatch",
    riderId: null,
    title: "Flyers",
    quantity: 100,
    updatedAt: "2026-11-18T00:00:00.000Z",
    ...partial,
  } as Order;
}

function timed(id: string, expiresAt: string, extra: Partial<NonNullable<Order["dispatchOffer"]>> = {}): Order {
  return job({
    id,
    dispatchOffer: {
      id: `dof_${id}`,
      status: "offered",
      riderId: "user_rider",
      offeredAt: "2026-11-18T02:59:30.000Z",
      timeoutSeconds: 30,
      expiresAt,
      ...extra,
    },
  });
}

describe("reading the server's clock", () => {
  it("measures how far this phone is from the server", () => {
    expect(serverClockOffsetMs("2026-11-18T03:00:05.000Z", NOW)).toBe(5000);
    expect(serverClockOffsetMs("2026-11-18T02:59:00.000Z", NOW)).toBe(-60_000);
  });

  it("trusts the phone when the server sent no time", () => {
    expect(serverClockOffsetMs(null, NOW)).toBe(0);
    expect(serverClockOffsetMs("not a time", NOW)).toBe(0);
  });
});

describe("the one offer", () => {
  it("is the live reservation held for this rider", () => {
    const live = timed("live", "2026-11-18T03:00:20.000Z");
    expect(currentOffer([live], "user_rider", NOW)).toBe(live);
  });

  it("is gone at the server's expiry instant, whatever the phone thinks", () => {
    const ending = timed("ending", "2026-11-18T03:00:00.000Z");
    expect(currentOffer([ending], "user_rider", NOW)).toBeNull();
    expect(currentOffer([ending], "user_rider", NOW - 1)).toBe(ending);
  });

  it("is never another rider's reservation, nor one already answered", () => {
    expect(currentOffer([timed("theirs", "2026-11-18T03:00:20.000Z", { riderId: "user_other" })], "user_rider", NOW)).toBeNull();
    expect(currentOffer([timed("declined", "2026-11-18T03:00:20.000Z", { status: "declined" })], "user_rider", NOW)).toBeNull();
  });

  it("falls back to the newest open job on an API with no exclusive offers", () => {
    const older = job({ id: "older", updatedAt: "2026-11-17T00:00:00.000Z" });
    const newer = job({ id: "newer", updatedAt: "2026-11-18T00:00:00.000Z" });
    expect(currentOffer([older, newer], "user_rider", NOW)?.id).toBe("newer");
    expect(currentOffer([job({ id: "taken", riderId: "user_other" })], "user_rider", NOW)).toBeNull();
  });
});

describe("the countdown", () => {
  const offer = timed("o", "2026-11-18T03:00:18.000Z");

  it("counts whole seconds down to zero, never past the snapshotted timeout", () => {
    expect(offerSecondsLeft(offer, NOW)).toBe(18);
    expect(offerSecondsLeft(offer, NOW + 17_500)).toBe(1);
    expect(offerSecondsLeft(offer, NOW + 60_000)).toBe(0);
    // A server clock behind the offer time never shows more than was offered.
    expect(offerSecondsLeft(offer, NOW - 60_000)).toBe(30);
  });

  it("has no countdown on an untimed offer", () => {
    expect(offerSecondsLeft(job({ id: "plain" }), NOW)).toBeNull();
    expect(offerFractionLeft(job({ id: "plain" }), NOW)).toBeNull();
  });

  it("drains the bar in proportion", () => {
    expect(offerFractionLeft(offer, NOW)).toBeCloseTo(0.6);
    expect(offerFractionLeft(offer, NOW + 60_000)).toBe(0);
  });

  it("reads like a clock, and says the seconds aloud", () => {
    expect(countdownLabel(18)).toBe("0:18");
    expect(countdownLabel(75)).toBe("1:15");
    expect(countdownSpoken(1)).toBe("1 second left to accept");
    expect(countdownSpoken(12)).toBe("12 seconds left to accept");
  });
});

describe("distance and cargo", () => {
  it("states the stored distance, never a time", () => {
    expect(offerDistanceLabel(job({ id: "a", travelEstimate: { distanceMeters: 2400, durationSeconds: null, source: "x" } } as never))).toBe(
      "2.4 km from shop to drop-off",
    );
    expect(offerDistanceLabel(job({ id: "b", deliveryDistanceMeters: 640 }))).toBe("600 m from shop to drop-off");
    expect(offerDistanceLabel(job({ id: "c" }))).toBeNull();
  });

  it("lists the cargo lines, or the job itself on an older API", () => {
    const withLines = job({
      id: "a",
      cargoSummary: {
        lines: [
          { lineItemId: "l1", description: "Business cards", quantity: 200 },
          { lineItemId: "l2", description: "", quantity: 50 },
          { lineItemId: "l3", description: "Nothing", quantity: 0 },
        ],
        totalQuantity: 250,
      },
    });
    expect(cargoLines(withLines)).toEqual([
      { key: "l1", description: "Business cards", quantity: 200 },
      { key: "l2", description: "Flyers", quantity: 50 },
    ]);
    expect(cargoTotalLabel(withLines)).toBe("250 pieces");
    expect(cargoLines(job({ id: "b", quantity: 1 }))).toEqual([{ key: "b", description: "Flyers", quantity: 1 }]);
    expect(cargoTotalLabel(job({ id: "b", quantity: 1 }))).toBe("1 piece");
  });

  it("sends the offer id only for a live reservation", () => {
    expect(offerIdOf(timed("o", "2026-11-18T03:00:18.000Z"))).toBe("dof_o");
    expect(offerIdOf(timed("o", "2026-11-18T03:00:18.000Z", { status: "expired" }))).toBeNull();
    expect(offerIdOf(job({ id: "plain" }))).toBeNull();
  });
});
