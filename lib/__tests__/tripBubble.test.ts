import {
  backgroundRefreshDue,
  BUBBLE_BACKGROUND_REFRESH_MS,
  bubbleLabel,
  bubbleOrderId,
  bubbleSettingsRow,
  bubbleUnread,
  openBubbleSettings,
  readBubblePermission,
} from "@/lib/tripBubble";

jest.mock("@/modules/trip-bubble", () => ({ TripBubbleModule: null }));

type Native = NonNullable<Parameters<typeof readBubblePermission>[1]>;

function native(overrides: Partial<Native> = {}): Native {
  return {
    canDrawOverlays: () => true,
    openOverlaySettings: async () => undefined,
    show: () => true,
    hide: () => undefined,
    addListener: () => ({ remove: () => undefined }),
    ...overrides,
  };
}

describe("readBubblePermission", () => {
  it("is unavailable off Android, whatever the native side says", () => {
    expect(readBubblePermission("ios", native())).toBe("unavailable");
    expect(readBubblePermission("web", native())).toBe("unavailable");
  });

  it("is unavailable on an Android build without the module (Expo Go, older builds)", () => {
    expect(readBubblePermission("android", null)).toBe("unavailable");
  });

  it("reads the phone's Display over other apps switch", () => {
    expect(readBubblePermission("android", native({ canDrawOverlays: () => true }))).toBe("granted");
    expect(readBubblePermission("android", native({ canDrawOverlays: () => false }))).toBe("denied");
  });

  it("treats a native failure as no bubble rather than a crash", () => {
    const broken = native({ canDrawOverlays: () => { throw new Error("gone"); } });
    expect(readBubblePermission("android", broken)).toBe("unavailable");
  });
});

describe("openBubbleSettings", () => {
  it("never throws, with or without a settings screen", async () => {
    await expect(openBubbleSettings(null)).resolves.toBeUndefined();
    const refusing = native({ openOverlaySettings: async () => { throw new Error("no screen"); } });
    await expect(openBubbleSettings(refusing)).resolves.toBeUndefined();
  });
});

describe("bubbleOrderId", () => {
  const order = { id: "o1", riderId: "r1", state: "out_for_delivery" };
  const base = { permission: "granted" as const, userId: "r1", canWork: true, order };

  it("names the rider's own active job", () => {
    expect(bubbleOrderId(base)).toBe("o1");
    for (const state of ["rider_assigned", "picked_up", "out_for_delivery"]) {
      expect(bubbleOrderId({ ...base, order: { ...order, state } })).toBe("o1");
    }
  });

  it("shows nothing once the job has left the rider", () => {
    for (const state of ["delivered", "completed", "cancelled", "ready_for_dispatch"]) {
      expect(bubbleOrderId({ ...base, order: { ...order, state } })).toBeNull();
    }
    expect(bubbleOrderId({ ...base, order: null })).toBeNull();
  });

  it("shows nothing when the rider said no, or the phone cannot draw one", () => {
    expect(bubbleOrderId({ ...base, permission: "denied" })).toBeNull();
    expect(bubbleOrderId({ ...base, permission: "unavailable" })).toBeNull();
  });

  it("shows nothing signed out, unapproved or on hold, or for someone else's job", () => {
    expect(bubbleOrderId({ ...base, userId: null })).toBeNull();
    expect(bubbleOrderId({ ...base, canWork: false })).toBeNull();
    expect(bubbleOrderId({ ...base, order: { ...order, riderId: "r2" } })).toBeNull();
  });
});

describe("bubbleUnread", () => {
  const items = [
    { id: "n1", read: false, orderId: "o1" }, // message from the client
    { id: "n2", read: false, orderId: "o1" }, // order update
    { id: "n3", read: true, orderId: "o1" },
    { id: "n4", read: false, orderId: "o2" }, // another job
    { id: "n5", read: false }, // an announcement
  ];

  it("counts unread alerts about this job only", () => {
    expect(bubbleUnread(items, [], "o1")).toBe(2);
    expect(bubbleUnread(items, [], "o2")).toBe(1);
  });

  it("honours the Alerts screen's local read marks", () => {
    expect(bubbleUnread(items, ["n1"], "o1")).toBe(1);
    expect(bubbleUnread(items, ["n1", "n2"], "o1")).toBe(0);
  });

  it("is zero before the inbox has loaded", () => {
    expect(bubbleUnread(null, [], "o1")).toBe(0);
  });
});

describe("bubbleLabel", () => {
  it("says what a tap does, and the count when there is one", () => {
    expect(bubbleLabel(0)).toBe("GRIDGO. Open your delivery");
    expect(bubbleLabel(1)).toBe("GRIDGO, 1 new message or update. Open your delivery");
    expect(bubbleLabel(12)).toBe("GRIDGO, 12 new messages and updates. Open your delivery");
  });
});

describe("backgroundRefreshDue", () => {
  it("reads at once, then no more often than the foreground fallback", () => {
    expect(backgroundRefreshDue(null, 1_000)).toBe(true);
    expect(backgroundRefreshDue(1_000, 1_000 + BUBBLE_BACKGROUND_REFRESH_MS - 1)).toBe(false);
    expect(backgroundRefreshDue(1_000, 1_000 + BUBBLE_BACKGROUND_REFRESH_MS)).toBe(true);
  });
});

describe("bubbleSettingsRow", () => {
  it("states the switch in words, never by colour alone", () => {
    expect(bubbleSettingsRow("granted").value).toBe("On");
    expect(bubbleSettingsRow("denied").value).toBe("Off");
  });

  it("tells the rider to pick GRIDGO Rider, because Android opens a list of apps", () => {
    expect(bubbleSettingsRow("denied").detail).toMatch(/pick GRIDGO Rider/);
    expect(bubbleSettingsRow("granted").detail).toMatch(/pick GRIDGO Rider/);
  });
});
