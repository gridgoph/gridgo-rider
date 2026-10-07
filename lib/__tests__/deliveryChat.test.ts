import {
  closesAtLabel,
  deliveryChatEntry,
  deliveryChatNotice,
  deliveryChatOf,
  deliveryChatRoute,
  deliveryChatUnavailable,
  deliverySendError,
  senderLabel,
} from "@/lib/deliveryChat";

function apiError(code: string) {
  return Object.assign(new Error(code), { status: 409, body: { error: code } });
}

// 2026-10-08 00:07 in Davao.
const NOW = Date.parse("2026-10-07T16:07:00.000Z");

describe("deliveryChatOf", () => {
  it("reads the API's own answer and nothing else", () => {
    expect(deliveryChatOf({ deliveryChat: { status: "open", closesAt: null, retentionHours: 24 } })).toEqual({
      status: "open",
      closesAt: null,
      retentionHours: 24,
    });
    expect(
      deliveryChatOf({ deliveryChat: { status: "read_only", closesAt: "2026-10-08T14:03:00.000Z", retentionHours: 24 } }),
    ).toEqual({ status: "read_only", closesAt: "2026-10-08T14:03:00.000Z", retentionHours: 24 });
  });

  it("offers nothing when the order carries no conversation, or one this build does not know", () => {
    expect(deliveryChatOf({})).toBeNull();
    expect(deliveryChatOf(null)).toBeNull();
    expect(deliveryChatOf({ deliveryChat: null })).toBeNull();
    expect(deliveryChatOf({ deliveryChat: { status: "closed" } })).toBeNull();
    expect(deliveryChatOf({ deliveryChat: { status: "archived", closesAt: null } })).toBeNull();
  });

  it("tolerates a missing or malformed close time and retention", () => {
    expect(deliveryChatOf({ deliveryChat: { status: "read_only", closesAt: "soon" } })).toEqual({
      status: "read_only",
      closesAt: null,
      retentionHours: 24,
    });
  });
});

describe("words", () => {
  it("names the close time in Davao, relative to today", () => {
    expect(closesAtLabel("2026-10-08T14:03:00.000Z", NOW)).toBe("10:03 PM today");
    expect(closesAtLabel("2026-10-09T01:30:00.000Z", NOW)).toBe("9:30 AM tomorrow");
    expect(closesAtLabel("2026-10-12T01:30:00.000Z", NOW)).toMatch(/^Mon, Oct 12, 9:30 AM$/);
  });

  it("invites a message while the rider has the job, and says when a delivered one goes", () => {
    const open = deliveryChatEntry({ status: "open", closesAt: null, retentionHours: 24 }, NOW);
    expect(open.title).toBe("Message the client");
    expect(open.detail).toContain("Neither of you sees a phone number");
    const delivered = deliveryChatEntry({ status: "read_only", closesAt: "2026-10-08T14:03:00.000Z", retentionHours: 24 }, NOW);
    expect(delivered.title).toBe("Messages with the client");
    expect(delivered.detail).toBe("Delivered. Readable until 10:03 PM today, then removed.");
  });

  it("says who sees the messages and that they go", () => {
    expect(deliveryChatNotice({ status: "open", closesAt: null, retentionHours: 24 }, NOW)).toBe(
      "Only you and the client see these messages. They are removed 24 hours after delivery.",
    );
    expect(deliveryChatNotice({ status: "read_only", closesAt: "2026-10-08T14:03:00.000Z", retentionHours: 24 }, NOW)).toBe(
      "This delivery is finished, so no new messages can be sent. These are removed at 10:03 PM today.",
    );
  });

  it("labels the sender without naming anyone", () => {
    expect(senderLabel({ mine: true })).toBe("You");
    expect(senderLabel({ mine: false })).toBe("Client");
  });

  it("routes to the conversation by order", () => {
    expect(deliveryChatRoute("order_1")).toEqual({ pathname: "/trip/messages", params: { orderId: "order_1" } });
  });
});

describe("refusals", () => {
  it("explains a removed, not-yet-open or forbidden conversation", () => {
    expect(deliveryChatUnavailable(apiError("delivery_chat_closed"))?.title).toBe("These messages were removed");
    expect(deliveryChatUnavailable(apiError("delivery_chat_not_available"))?.title).toBe("No client to message on this job");
    expect(deliveryChatUnavailable(apiError("forbidden"))?.title).toBe("This conversation is not available");
  });

  it("leaves a dropped connection to a retry", () => {
    expect(deliveryChatUnavailable(new Error("Network request failed"))).toBeNull();
    expect(deliveryChatUnavailable(apiError("server_error"))).toBeNull();
  });

  it("words a send that did not go through", () => {
    expect(deliverySendError(apiError("delivery_chat_read_only"))).toBe(
      "This delivery is finished, so no new messages can be sent.",
    );
    expect(deliverySendError(apiError("too_many_requests"))).toMatch(/too fast/);
    expect(deliverySendError(new Error("offline"))).toMatch(/did not reach the client/);
  });
});
