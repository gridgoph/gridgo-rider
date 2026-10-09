import {
  callDurationLabel,
  callWindow,
  counterpartOf,
  counterpartPhrase,
  endReasonCopy,
  endReasonOf,
  endReasonOfError,
  latestMissedCall,
  parseOrderCall,
  parseOrderCalls,
  phaseLabel,
  ringingIncoming,
  type OrderCall,
} from "@/lib/orderCalls";
import { parsePushData, pushTargetRoute } from "@/lib/push";

const AT = Date.parse("2026-10-08T08:00:00.000Z");

function call(patch: Partial<OrderCall> = {}): OrderCall {
  return {
    id: "c1",
    orderId: "ord_1",
    pair: "delivery",
    state: "ringing",
    caller: { firstName: "Alex", role: "client" },
    callee: { firstName: "Sam", role: "rider" },
    mine: false,
    createdAt: new Date(AT).toISOString(),
    ringExpiresAt: new Date(AT + 30_000).toISOString(),
    acceptedAt: null,
    endedAt: null,
    leaseExpiresAt: null,
    ...patch,
  };
}

const open = { status: "open", closesAt: null, retentionHours: 24 };
const readOnly = { status: "read_only", closesAt: null, retentionHours: 24 };

describe("which calls the trip offers", () => {
  it("offers both while the rider is heading to the shop on a door delivery", () => {
    const order = { state: "rider_assigned", deliveryChat: open, pickupChat: open };
    expect(callWindow(order, "client")).toEqual({ open: true });
    expect(callWindow(order, "shop")).toEqual({ open: true });
  });

  it("closes the shop's call at pick-up and says why, while the client's stays", () => {
    for (const state of ["picked_up", "out_for_delivery"]) {
      const order = { state, deliveryChat: open, pickupChat: open };
      expect(callWindow(order, "client")).toEqual({ open: true });
      expect(callWindow(order, "shop")).toEqual({
        open: false,
        note: "Calls with the shop end at pick-up. You can still message them.",
      });
    }
  });

  it("has no client call on a job carried to GRIDGO Office (no client conversation)", () => {
    const order = { state: "rider_assigned", pickupChat: open };
    expect(callWindow(order, "client")).toEqual({ open: false, note: null });
    expect(callWindow(order, "shop")).toEqual({ open: true });
  });

  it("offers nothing once the job is delivered, or before the API says a conversation exists", () => {
    const delivered = { state: "delivered", deliveryChat: readOnly, pickupChat: readOnly };
    expect(callWindow(delivered, "client")).toEqual({ open: false, note: null });
    expect(callWindow(delivered, "shop")).toEqual({ open: false, note: null });
    expect(callWindow({ state: "rider_assigned" }, "shop")).toEqual({ open: false, note: null });
    expect(callWindow(null, "client")).toEqual({ open: false, note: null });
  });
});

describe("reading calls off the wire", () => {
  it("keeps only the allowlisted fields and falls back to the role for a missing name", () => {
    const parsed = parseOrderCall({ ...call(), callee: { role: "rider" }, phone: "+63 900 000 0000" });
    expect(parsed?.callee).toEqual({ firstName: "Rider", role: "rider" });
    expect(parsed).not.toHaveProperty("phone");
  });

  it("drops anything that is not a call", () => {
    expect(parseOrderCalls({ calls: [call(), { id: "x" }, null, call({ id: "c2", state: "ended" })] }).map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(parseOrderCall({ ...call(), pair: "video" })).toBeNull();
  });

  it("names the other person by role and first name", () => {
    expect(counterpartOf(call())).toEqual({ firstName: "Alex", role: "client" });
    expect(counterpartOf(call({ mine: true, callee: { firstName: "Mika", role: "supplier" } }))).toEqual({ firstName: "Mika", role: "supplier" });
    expect(counterpartPhrase({ firstName: "Mika", role: "supplier" })).toBe("Mika, the shop");
    expect(counterpartPhrase({ firstName: "Shop", role: "supplier" })).toBe("the shop");
  });
});

describe("what rings", () => {
  it("rings only for someone else's call that is still ringing and inside its deadline", () => {
    expect(ringingIncoming([call()], AT)?.id).toBe("c1");
    expect(ringingIncoming([call({ mine: true })], AT)).toBeNull();
    expect(ringingIncoming([call({ state: "missed" })], AT)).toBeNull();
    // A late push for a call whose ring ran out does not reopen ringing.
    expect(ringingIncoming([call()], AT + 30_000)).toBeNull();
  });
});

describe("what the call screen says", () => {
  it("names each connection state", () => {
    expect(phaseLabel("calling")).toBe("Calling…");
    expect(phaseLabel("ringing")).toBe("Ringing…");
    expect(phaseLabel("connecting")).toBe("Connecting…");
    expect(phaseLabel("reconnecting")).toBe("Reconnecting…");
  });

  it("reads a finished call from this side", () => {
    expect(endReasonOf({ state: "declined", mine: true, acceptedAt: null })).toBe("declined");
    expect(endReasonOf({ state: "declined", mine: false, acceptedAt: null })).toBe("declined_by_you");
    expect(endReasonOf({ state: "missed", mine: true, acceptedAt: null })).toBe("no_answer");
    expect(endReasonOf({ state: "missed", mine: false, acceptedAt: null })).toBe("missed");
    expect(endReasonOf({ state: "cancelled", mine: false, acceptedAt: null })).toBe("missed");
    expect(endReasonOf({ state: "ended", mine: true, acceptedAt: "x" })).toBe("ended");
  });

  it("gives every end a plain reason, naming the person", () => {
    const alex = { firstName: "Alex", role: "client" as const };
    expect(endReasonCopy("declined", alex).title).toBe("Call declined");
    expect(endReasonCopy("no_answer", alex)).toEqual({
      title: "No answer",
      body: "Alex did not pick up. They will see a missed call. Send a message, or try again.",
    });
    expect(endReasonCopy("network_lost", alex).title).toBe("Call dropped");
    expect(endReasonCopy("ended", alex).body).toBe("Your call with Alex, the client has ended.");
    expect(endReasonCopy("unsupported", null).title).toBe("Calls need the latest GRIDGO app");
  });

  it("maps API refusals without showing a code", () => {
    expect(endReasonOfError("call_not_available")).toBe("not_available");
    expect(endReasonOfError("call_already_active")).toBe("busy");
    expect(endReasonOfError("too_many_requests")).toBe("too_many");
    expect(endReasonOfError(null)).toBeNull();
  });

  it("formats the timer", () => {
    expect(callDurationLabel(7_400)).toBe("0:07");
    expect(callDurationLabel(760_000)).toBe("12:40");
    expect(callDurationLabel(3_729_000)).toBe("1:02:09");
  });
});

describe("the missed call on the trip", () => {
  it("shows the newest unanswered call to the rider", () => {
    const missed = latestMissedCall([call({ state: "missed" })]);
    expect(missed).toMatchObject({ call: { id: "c1" }, person: { firstName: "Alex", role: "client" }, declined: false });
  });

  it("is old news once either side calls again on the same pair, or once dismissed", () => {
    const later = new Date(AT + 60_000).toISOString();
    expect(latestMissedCall([call({ state: "missed" }), call({ id: "c2", mine: true, state: "ended", createdAt: later })])).toBeNull();
    expect(latestMissedCall([call({ state: "missed" })], ["c1"])).toBeNull();
    // A call to the shop does not answer a missed call from the client.
    const shop = call({ id: "c3", pair: "pickup", mine: true, state: "ended", createdAt: later });
    expect(latestMissedCall([call({ state: "cancelled" }), shop])?.call.id).toBe("c1");
  });

  it("never treats the rider's own unanswered call as missed", () => {
    expect(latestMissedCall([call({ mine: true, state: "missed" })])).toBeNull();
  });
});

describe("call pushes", () => {
  it("opens the call screen for a call ringing in, and the trip for a missed one", () => {
    expect(pushTargetRoute(parsePushData({ type: "order_call_incoming", orderId: "ord_1", notificationId: "n1" }))).toBe(
      "/call?orderId=ord_1&incoming=1",
    );
    expect(pushTargetRoute(parsePushData({ type: "order_call_missed", orderId: "ord_1", notificationId: "n2" }))).toBe(
      "/(tabs)/active",
    );
  });
});
