import type { PlayOptInState } from "@/lib/api";
import {
  checkGmail,
  currentOptInStep,
  optInCardVisible,
  optInInstall,
  optInSteps,
  prefilledGmail,
} from "@/lib/playOptIn";
import { parsePushData, pushTargetRoute } from "@/lib/push";

/** The Play opt-in rules (gridgo-api `docs/PLAY_OPTIN_API.md`), app=rider. */

const optIn = (overrides: Partial<PlayOptInState> = {}): PlayOptInState => ({
  app: "rider",
  show: true,
  step: "confirm_gmail",
  gmailSuggestion: "rider@gmail.com",
  groupMode: "link",
  campaignEnabled: true,
  optInUrl: "https://play.google.com/apps/testing/ph.gridgo.rider",
  groupJoinUrl: "https://groups.google.com/g/example-testers",
  target: 12,
  optedIn: false,
  dismissCount: 0,
  playStoreUrl: "https://play.google.com/store/apps/details?id=ph.gridgo.rider",
  ...overrides,
});

const apk = { platform: "android", channel: "sideload" } as const;

describe("install report", () => {
  it("maps the APK to sideload and the Play bundle to play", () => {
    expect(optInInstall("android", "sideload")).toEqual(apk);
    expect(optInInstall("android", "play")).toEqual({ platform: "android", channel: "play" });
    expect(optInInstall("ios", "sideload").platform).toBe("ios");
    expect(optInInstall("web", "sideload").platform).toBe("web");
    expect(optInInstall("web", "sideload", true).platform).toBe("android");
  });
});

describe("card visibility", () => {
  it("shows on an Android APK when GRIDGO says show", () => {
    expect(optInCardVisible(optIn(), apk)).toBe(true);
  });

  it("is Android only", () => {
    expect(optInCardVisible(optIn(), { platform: "ios", channel: "sideload" })).toBe(false);
    expect(optInCardVisible(optIn(), { platform: "web", channel: "sideload" })).toBe(false);
  });

  it("is hidden on the Play channel even if a stale answer says show", () => {
    expect(optInCardVisible(optIn(), { platform: "android", channel: "play" })).toBe(false);
  });

  it("stops after the third close, and holds a close for the session", () => {
    expect(optInCardVisible(optIn({ dismissCount: 2 }), apk)).toBe(true);
    expect(optInCardVisible(optIn({ dismissCount: 3 }), apk)).toBe(false);
    expect(optInCardVisible(optIn(), apk, true)).toBe(false);
  });

  it("never adds a card GRIDGO did not offer, and hides once opted in", () => {
    expect(optInCardVisible(null, apk)).toBe(false);
    expect(optInCardVisible(optIn({ show: false }), apk)).toBe(false);
    expect(optInCardVisible(optIn({ optedIn: true }), apk)).toBe(false);
    expect(optInCardVisible(optIn({ step: "opted_in" }), apk)).toBe(false);
  });
});

describe("Gmail check", () => {
  it("accepts Gmail and Googlemail as they are", () => {
    expect(checkGmail(" rider@gmail.com ", false)).toEqual({ ok: true, googleAccount: false });
    expect(checkGmail("Rider@GoogleMail.com", false)).toEqual({ ok: true, googleAccount: false });
  });

  it("refuses empty and malformed input", () => {
    expect(checkGmail("", false)).toMatchObject({ ok: false, error: "Enter your Gmail." });
    expect(checkGmail("rider@", false)).toMatchObject({ ok: false, error: "That does not look like an email address." });
    expect(checkGmail("ri der@gmail.com", false)).toMatchObject({ ok: false });
  });

  it("asks a custom address to be named a Google account before it goes", () => {
    expect(checkGmail("rider@company.ph", false)).toEqual({ ok: false, error: null, needsGoogleAccount: true });
    expect(checkGmail("rider@company.ph", true)).toEqual({ ok: true, googleAccount: true });
  });

  it("prefills only a Gmail suggestion", () => {
    expect(prefilledGmail(optIn())).toBe("rider@gmail.com");
    expect(prefilledGmail(optIn({ gmailSuggestion: "rider@company.ph" }))).toBe("");
    expect(prefilledGmail(optIn({ gmailSuggestion: null }))).toBe("");
  });
});

describe("steps", () => {
  const none = { groupOpened: false, optInOpened: false, failed: null };

  it("link mode: Gmail, group, Play testing page, install", () => {
    expect(optInSteps(optIn(), none).map((s) => s.key)).toEqual(["gmail", "group", "optin", "install"]);
    expect(currentOptInStep(optIn({ step: "join_group" }), none)).toBe("group");
    expect(currentOptInStep(optIn({ step: "join_group" }), { groupOpened: true, optInOpened: false, failed: null })).toBe("optin");
    expect(currentOptInStep(optIn({ step: "join_group" }), { groupOpened: true, optInOpened: true, failed: null })).toBe("install");
    expect(currentOptInStep(optIn({ step: "install_from_play" }), none)).toBe("install");
  });

  it("keeps a link that did not open as the current step after GRIDGO moved on", () => {
    // The event committed, so GRIDGO's next read is already one step ahead.
    expect(currentOptInStep(optIn({ step: "open_optin" }), { ...none, failed: "group" })).toBe("group");
    expect(currentOptInStep(optIn({ step: "install_from_play" }), { ...none, failed: "optin" })).toBe("optin");
    expect(optInSteps(optIn({ step: "install_from_play" }), { ...none, groupOpened: true, failed: "optin" })).toEqual([
      { key: "gmail", status: "done" },
      { key: "group", status: "done" },
      { key: "optin", status: "current" },
      { key: "install", status: "ahead" },
    ]);
    // A changed Gmail or an opt-in still wins.
    expect(currentOptInStep(optIn({ step: "confirm_gmail" }), { ...none, failed: "optin" })).toBe("gmail");
    expect(currentOptInStep(optIn({ step: "opted_in" }), { ...none, failed: "optin" })).toBe("done");
  });

  it("automatic mode has no group step", () => {
    const state = optIn({ groupMode: "automatic", groupJoinUrl: null, step: "open_optin" });
    expect(optInSteps(state, none)).toEqual([
      { key: "gmail", status: "done" },
      { key: "optin", status: "current" },
      { key: "install", status: "ahead" },
    ]);
  });
});

describe("push routing", () => {
  it("opens the tester steps for play_optin", () => {
    expect(pushTargetRoute(parsePushData({ type: "play_optin", notificationId: "n1" }))).toBe("/play-optin?from=push");
  });
});
