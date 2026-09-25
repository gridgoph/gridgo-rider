import {
  EMPTY_PUSH_PROMPT_MEMORY,
  PUSH_PROMPT_REOFFER_MS,
  devicePlatform,
  parsePushPromptMemory,
  parsePushData,
  PUSH_CHANNEL_ID,
  PUSH_FOREGROUND_BEHAVIOR,
  pushOffer,
  pushOfferCopy,
  pushPromptCopy,
  pushPromptReasons,
  pushTargetRoute,
  readPushPermission,
  shouldOfferPushPrompt,
} from "@/lib/push";

describe("the channel the server names", () => {
  it("is the server's own identifier", () => {
    // Not this app's to choose: the server sets `channel_id` on every message
    // and Android 8+ drops or downgrades one naming a channel that does not
    // exist. All three GRIDGO apps must use this exact string.
    expect(PUSH_CHANNEL_ID).toBe("gridgo_default");
  });
});

describe("devicePlatform", () => {
  it("passes through the three the contract accepts", () => {
    expect(devicePlatform("android")).toBe("android");
    expect(devicePlatform("ios")).toBe("ios");
    expect(devicePlatform("web")).toBe("web");
  });

  it("refuses anything else rather than earning a 400", () => {
    expect(devicePlatform("windows")).toBeNull();
    expect(devicePlatform("macos")).toBeNull();
  });
});

describe("parsePushData", () => {
  it("reads the four contractual keys", () => {
    expect(
      parsePushData({
        notificationId: "ntf_9c1f3a",
        type: "pickup_escalation_resolved",
        orderId: "ord_demo_1",
        at: "2026-08-11T02:00:00.000Z",
      }),
    ).toEqual({
      notificationId: "ntf_9c1f3a",
      type: "pickup_escalation_resolved",
      orderId: "ord_demo_1",
      at: "2026-08-11T02:00:00.000Z",
    });
  });

  it("leaves an absent key null — an alert with no job carries no orderId", () => {
    expect(parsePushData({ notificationId: "ntf_1", type: "announcement" })).toEqual({
      notificationId: "ntf_1",
      type: "announcement",
      orderId: null,
      at: null,
    });
  });

  it("never throws on a payload that has drifted", () => {
    // A tap must always land somewhere. Whatever arrives, this returns a shape.
    for (const raw of [null, undefined, "", 7, [], { orderId: { id: 1 } }]) {
      expect(() => parsePushData(raw)).not.toThrow();
    }
    expect(parsePushData(null).orderId).toBeNull();
    expect(parsePushData({ orderId: { id: 1 } }).orderId).toBeNull();
  });

  it("treats a blank string as absent, not as an id", () => {
    expect(parsePushData({ orderId: "   " }).orderId).toBeNull();
  });
});

describe("pushTargetRoute", () => {
  it("opens Active for a job the rider already has in hand", () => {
    // Pickup-check answers and trip steps live on Active, not on a per-order
    // workspace — this app has none. The push carries no order state, so
    // Active fetches the trip as it always does.
    expect(pushTargetRoute(parsePushData({ orderId: "ord_demo_1" }))).toBe("/(tabs)/active");
    expect(
      pushTargetRoute(
        parsePushData({ type: "pickup_escalation_resolved", orderId: "ord_demo_1" }),
      ),
    ).toBe("/(tabs)/active");
  });

  it("opens Offers for a dispatch offer, where Accept lives", () => {
    // The genuine rider divergence from supplier. A shop Accepts on the job
    // workspace; a rider Accepts on Offers. Routing an offer tap at Active
    // would land them on an empty trip (or a different one).
    expect(
      pushTargetRoute(parsePushData({ type: "dispatch_available", orderId: "ord_demo_1" })),
    ).toBe("/(tabs)/offers");
    expect(
      pushTargetRoute(parsePushData({ type: "rider_job_offered", orderId: "ord_demo_1" })),
    ).toBe("/(tabs)/offers");
  });

  it("opens Alerts when there is no job behind the alert", () => {
    expect(pushTargetRoute(parsePushData({ type: "account_update" }))).toBe("/alerts");
  });

  it("opens Alerts for a platform announcement", () => {
    // audience: riders / everyone. No order, nothing to Accept, nothing to
    // drive. Alerts is a pushed route here, not a tab.
    expect(pushTargetRoute(parsePushData({ type: "announcement" }))).toBe("/alerts");
    expect(
      pushTargetRoute(parsePushData({ type: "announcement", orderId: "ord_should_not_win" })),
    ).toBe("/alerts");
  });

  it("opens Alerts for a type this build has never heard of, when there is no job", () => {
    // The contract's own instruction: treat an unknown type as "open the list".
    // Guessing a screen from a string added after this build shipped is how a
    // tap lands somewhere that cannot explain itself.
    expect(pushTargetRoute(parsePushData({ type: "invented_in_2027" }))).toBe("/alerts");
  });
});

describe("readPushPermission", () => {
  it("reads a grant", () => {
    expect(readPushPermission({ granted: true, status: "granted", canAskAgain: false })).toBe(
      "granted",
    );
  });

  it("reads a phone that has not been asked", () => {
    expect(readPushPermission({ granted: false, status: "undetermined", canAskAgain: true })).toBe(
      "undetermined",
    );
  });

  it("separates a refusal the app may re-ask from one it may not", () => {
    // The whole reason the state exists. On Android 13+ a refusal stops the OS
    // offering the dialog, so an app that keeps calling request() shows the
    // person nothing at all and looks broken.
    expect(readPushPermission({ granted: false, status: "denied", canAskAgain: true })).toBe(
      "undetermined",
    );
    expect(readPushPermission({ granted: false, status: "denied", canAskAgain: false })).toBe(
      "blocked",
    );
  });

  it("counts iOS provisional authorisation as granted", () => {
    expect(readPushPermission({ granted: true, status: "provisional" })).toBe("granted");
  });
});

describe("pushOffer", () => {
  const base = { supported: true, signedIn: true, permission: "undetermined" as const };

  it("offers the ask to a signed-in rider that has not been asked", () => {
    expect(pushOffer(base)).toBe("ask");
  });

  it("offers nothing once permission is granted", () => {
    expect(pushOffer({ ...base, permission: "granted" })).toBe("hidden");
  });

  it("sends a blocked phone to its own settings, which is the only thing that works", () => {
    expect(pushOffer({ ...base, permission: "blocked" })).toBe("settings");
  });

  it("offers nothing where push cannot work at all", () => {
    // Web has no service worker in this MVP; a card leading nowhere is worse
    // than no card.
    expect(pushOffer({ ...base, supported: false })).toBe("hidden");
    expect(pushOffer({ ...base, supported: false, signedIn: false })).toBe("hidden");
  });

  it("still asks at the door, because a rider that never signs in must be reachable", () => {
    // The supplier rule, kept on purpose. On Android 13+ the permission can
    // only be asked while the app is open, so a door that never asks is a
    // phone GRIDGO can never tell to update.
    expect(pushOffer({ ...base, signedIn: false })).toBe("ask");
  });

  it("tells a signed-out phone nothing it cannot act on", () => {
    // "Notifications are blocked" and "registration failed" are both about an
    // account that does not exist yet, to somebody standing at a sign-in
    // screen. Neither earns space on the door.
    expect(pushOffer({ ...base, signedIn: false, permission: "blocked" })).toBe("hidden");
    expect(pushOffer({ ...base, signedIn: false, permission: "granted" })).toBe("hidden");
    expect(pushOffer({ ...base, signedIn: false, permission: "unknown" })).toBe("hidden");
    expect(pushOffer({ ...base, signedIn: false, failed: true })).toBe("ask");
  });

  it("keeps saying so when a granted phone failed to register", () => {
    // The worst state: it looks exactly like a working phone and simply never
    // rings. Nothing else in the app would ever mention it.
    expect(pushOffer({ ...base, permission: "granted", failed: true })).toBe("retry");
  });

  it("still sends a blocked phone to settings even when something failed", () => {
    expect(pushOffer({ ...base, permission: "blocked", failed: true })).toBe("settings");
  });

  it("offers nothing before the permission has been read", () => {
    // Expo Go and web never resolve one. Drawing an ask that cannot be
    // answered would be the app promising something it cannot do.
    expect(pushOffer({ ...base, permission: "unknown" })).toBe("hidden");
  });
});

describe("pushOfferCopy", () => {
  it("names a rider's own work, not a print shop's", () => {
    const copy = pushOfferCopy("ask");
    expect(copy.body).toMatch(/job is offered to you/i);
    expect(copy.body).toMatch(/pickup check/i);
    expect(copy.body).toMatch(/approved/i);
    expect(copy.body).not.toMatch(/shop/i);
    expect(copy.body).not.toMatch(/payout/i);
    expect(copy.action).toMatch(/turn on/i);
  });

  it("promises a signed-out phone only what an unclaimed phone actually gets", () => {
    // GRIDGO has no idea whose phone this is at the door, so promising job
    // offers there would be a lie. It promises the announcement, and says the
    // rest follows sign-in.
    const copy = pushOfferCopy("ask", false);
    expect(copy.body).toMatch(/new version/i);
    expect(copy.body).toMatch(/once you sign in/i);
    expect(copy.body).not.toMatch(/job is offered to you/i);
  });

  it("asks a blocked phone to open settings rather than promising a dialog", () => {
    expect(pushOfferCopy("settings").action).toMatch(/settings/i);
  });

  it("tells a phone that failed to register that the in-app list still works", () => {
    // Refusal and failure must both leave the app readable as working, because
    // it is: the Alerts list is the source of truth and push only supplements it.
    expect(pushOfferCopy("retry").body).toMatch(/still arrive in the app/i);
    expect(pushOfferCopy("settings").body).toMatch(/while the app is open/i);
  });
});

describe("the foreground behaviour", () => {
  it("shows nothing — the app is already announcing it", () => {
    // "Do not double-announce": a push is the same record the Alerts list and
    // its unread badge carry. A banner on top of that is the same news twice.
    expect(PUSH_FOREGROUND_BEHAVIOR).toEqual({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
  });
});

describe("the notifications explainer", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 8, 25, 2);
  const base = {
    supported: true,
    signedIn: true,
    permission: "undetermined" as const,
    memory: EMPTY_PUSH_PROMPT_MEMORY,
    nowMs: now,
  };

  it("is due for a signed-in rider who has never seen it", () => {
    expect(shouldOfferPushPrompt(base)).toBe(true);
  });

  it("is due for an existing rider whose phone already refused, so it can point at settings", () => {
    expect(shouldOfferPushPrompt({ ...base, permission: "blocked" })).toBe(true);
  });

  it("stays away once notifications are on, before permission is read, and where push cannot work", () => {
    expect(shouldOfferPushPrompt({ ...base, permission: "granted" })).toBe(false);
    expect(shouldOfferPushPrompt({ ...base, permission: "unknown" })).toBe(false);
    expect(shouldOfferPushPrompt({ ...base, supported: false })).toBe(false);
  });

  it("leaves the sign-in door to the card", () => {
    expect(shouldOfferPushPrompt({ ...base, signedIn: false })).toBe(false);
  });

  it("comes back no sooner than seven days after it was last shown", () => {
    const shown = (ago: number) => ({ ...base, memory: { offeredAtMs: now - ago } });
    expect(shouldOfferPushPrompt(shown(0))).toBe(false);
    expect(shouldOfferPushPrompt(shown(6 * DAY + 23 * 60 * 60 * 1000))).toBe(false);
    expect(shouldOfferPushPrompt(shown(7 * DAY))).toBe(true);
    expect(PUSH_PROMPT_REOFFER_MS).toBe(7 * DAY);
  });

  it("treats a clock set back past the last offer as due rather than silenced", () => {
    expect(shouldOfferPushPrompt({ ...base, memory: { offeredAtMs: now + 30 * DAY } })).toBe(true);
  });

  it("reads anything unreadable as never offered", () => {
    expect(parsePushPromptMemory(null)).toEqual({ offeredAtMs: null });
    expect(parsePushPromptMemory("not json")).toEqual({ offeredAtMs: null });
    expect(parsePushPromptMemory('{"offeredAtMs":"soon"}')).toEqual({ offeredAtMs: null });
    expect(parsePushPromptMemory('{"offeredAtMs":1790000000000}')).toEqual({
      offeredAtMs: 1790000000000,
    });
  });

  it("names the button after what it does in each state", () => {
    expect(pushPromptCopy("undetermined").action).toBe("Turn on notifications");
    expect(pushPromptCopy("undetermined").dismiss).toBe("Not now");
    const blocked = pushPromptCopy("blocked");
    expect(blocked.action).toBe("Open phone settings");
    expect(blocked.body).toMatch(/cannot ask again/);
  });

  it("promises the approval alert only while there is an approval to wait for", () => {
    expect(pushPromptReasons(true).map((r) => r.icon)).toEqual(["offer", "pickup", "approval"]);
    expect(pushPromptReasons(false).map((r) => r.icon)).toEqual(["offer", "pickup"]);
  });
});
