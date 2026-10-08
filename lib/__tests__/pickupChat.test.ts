import {
  pickupChatEntry,
  pickupChatNotice,
  pickupChatOf,
  pickupChatRoute,
  pickupChatUnavailable,
  pickupSendError,
  unreadBadgeLabel,
} from "@/lib/pickupChat";

function apiError(code: string) {
  return Object.assign(new Error(code), { status: 409, body: { error: code } });
}

// 2026-10-08 00:07 in Davao.
const NOW = Date.parse("2026-10-07T16:07:00.000Z");

describe("pickupChatOf", () => {
  it("reads the API's answer, unread count included", () => {
    expect(pickupChatOf({ pickupChat: { status: "open", closesAt: null, retentionHours: 24, unread: 2 } })).toEqual({
      status: "open",
      closesAt: null,
      retentionHours: 24,
      unread: 2,
    });
    expect(
      pickupChatOf({ pickupChat: { status: "read_only", closesAt: "2026-10-08T14:03:00.000Z", unread: 0 } }),
    ).toEqual({ status: "read_only", closesAt: "2026-10-08T14:03:00.000Z", retentionHours: 24, unread: 0 });
  });

  it("has no conversation when the API sends none, or one it does not know", () => {
    expect(pickupChatOf(null)).toBeNull();
    expect(pickupChatOf({})).toBeNull();
    expect(pickupChatOf({ pickupChat: null })).toBeNull();
    expect(pickupChatOf({ pickupChat: { status: "closed", closesAt: null, unread: 0 } })).toBeNull();
  });

  it("never invents unread messages from a missing or malformed count", () => {
    expect(pickupChatOf({ pickupChat: { status: "open", closesAt: null } })?.unread).toBe(0);
    expect(pickupChatOf({ pickupChat: { status: "open", closesAt: null, unread: -3 } })?.unread).toBe(0);
    expect(pickupChatOf({ pickupChat: { status: "open", closesAt: null, unread: "4" } })?.unread).toBe(0);
    expect(pickupChatOf({ pickupChat: { status: "open", closesAt: null, unread: true } })?.unread).toBe(1);
  });

  it("is a separate thing from the client conversation on the same order", () => {
    const order = {
      deliveryChat: { status: "open", closesAt: null, retentionHours: 24 },
    };
    expect(pickupChatOf(order)).toBeNull();
  });
});

describe("unreadBadgeLabel", () => {
  it("counts what the rider has not opened, and caps it", () => {
    expect(unreadBadgeLabel(0)).toBeNull();
    expect(unreadBadgeLabel(1)).toBe("1 new");
    expect(unreadBadgeLabel(9)).toBe("9 new");
    expect(unreadBadgeLabel(12)).toBe("9+ new");
  });
});

describe("pickup chat words", () => {
  it("names the shop in every line, so it cannot read as the client's chat", () => {
    const open = pickupChatEntry({ status: "open", closesAt: null, retentionHours: 24, unread: 0 }, NOW);
    expect(open.title).toBe("Message the shop");
    expect(open.accessibilityLabel).toBe("Message the shop about this pick-up");
    expect(open.detail).toMatch(/first name only/);
    expect(pickupChatNotice({ status: "open", closesAt: null, retentionHours: 24 }, NOW)).toMatch(
      /^Only you and the shop see these messages\. The client does not\./,
    );
  });

  it("speaks the unread count to a screen reader", () => {
    expect(pickupChatEntry({ status: "open", closesAt: null, retentionHours: 24, unread: 3 }).accessibilityLabel).toBe(
      "3 new messages from the shop. Message the shop about this pick-up",
    );
  });

  it("says when a finished job's messages go", () => {
    const entry = pickupChatEntry(
      { status: "read_only", closesAt: "2026-10-08T14:03:00.000Z", retentionHours: 24, unread: 0 },
      NOW,
    );
    expect(entry.title).toBe("Messages with the shop");
    expect(entry.detail).toBe("Job finished. Readable until 10:03 PM today, then removed.");
  });

  it("opens on its own route", () => {
    expect(pickupChatRoute("ord_1")).toEqual({ pathname: "/trip/shop-messages", params: { orderId: "ord_1" } });
  });
});

describe("pickup chat errors", () => {
  it("explains a removed or not-yet-open conversation in the shop's words", () => {
    expect(pickupChatUnavailable(apiError("pickup_chat_closed"))?.title).toBe("These messages were removed");
    expect(pickupChatUnavailable(apiError("pickup_chat_not_available"))?.title).toBe("No shop to message yet");
    expect(pickupChatUnavailable(apiError("forbidden"))?.title).toBe("This conversation is not available");
    expect(pickupChatUnavailable(new Error("Network request failed"))).toBeNull();
  });

  it("words a refused send without leaking a code, and blames nobody for a dropped connection", () => {
    expect(pickupSendError(apiError("pickup_chat_read_only"), 1000)).toBe(
      "This job is finished, so no new messages can be sent.",
    );
    expect(pickupSendError(apiError("invalid_request"), 1000)).toMatch(/up to 1000 characters/);
    expect(pickupSendError(new Error("offline"), 1000)).toBe(
      "That did not reach the shop. Check your connection and send it again.",
    );
  });
});
