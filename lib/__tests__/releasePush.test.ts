import { openReleaseDestination, releaseNoticeDestination, showsOnInstall } from "../releasePush";

const APK = { url: "https://gridgo.talasora.com/downloads/gridgo-rider.apk", fallbackUrl: null };
const PLAY = {
  url: "market://details?id=ph.gridgo.rider",
  fallbackUrl: "https://play.google.com/store/apps/details?id=ph.gridgo.rider",
};
const TESTFLIGHT = { url: "itms-beta://", fallbackUrl: "https://testflight.apple.com/" };

const notice = (releaseChannel: string, storeTarget: string) => ({ type: "announcement", releaseChannel, storeTarget });

describe("a release notice that names its channel", () => {
  it("opens the store this install came from", () => {
    expect(releaseNoticeDestination(notice("apk", "apk_download"), "GRIDGO Rider 1.0.123 is ready", "apk")).toEqual(APK);
    expect(releaseNoticeDestination(notice("play", "play_store"), "GRIDGO Rider 1.0.123 is on the Play Store", "play")).toEqual(PLAY);
    expect(releaseNoticeDestination(notice("ios", "testflight"), "GRIDGO Rider 1.0.123 is in TestFlight", "ios")).toEqual(TESTFLIGHT);
  });

  it("never opens the APK download on a store install, whatever the title says", () => {
    for (const channel of ["play", "ios"] as const) {
      expect(releaseNoticeDestination(notice("apk", "apk_download"), "GRIDGO Rider 1.0.123 is ready", channel)).toBeNull();
      expect(releaseNoticeDestination({ type: "announcement" }, "GRIDGO Rider 1.0.123 is ready", channel)).toBeNull();
    }
  });

  it("leaves another channel's notice, a mismatched pair or an unknown store in the inbox", () => {
    expect(releaseNoticeDestination(notice("play", "play_store"), "x", "apk")).toBeNull();
    expect(releaseNoticeDestination(notice("ios", "testflight"), "x", "play")).toBeNull();
    expect(releaseNoticeDestination(notice("play", "testflight"), "x", "play")).toBeNull();
    expect(releaseNoticeDestination(notice("play", "somewhere_else"), "x", "play")).toBeNull();
    expect(releaseNoticeDestination({ type: "announcement", storeTarget: "play_store" }, "x", "play")).toBeNull();
    expect(releaseNoticeDestination(notice("play", "play_store"), "x", null)).toBeNull();
  });

  it("is only ever an announcement", () => {
    expect(releaseNoticeDestination({ ...notice("play", "play_store"), type: "order_updated" }, "x", "play")).toBeNull();
  });
});

describe("a release notice from before channels", () => {
  it("opens this app's fixed APK download on an APK install, signed out too", () => {
    expect(releaseNoticeDestination({ type: "announcement" }, "GRIDGO Rider 1.0.123 is ready", "apk")).toEqual(APK);
  });

  it("leaves ordinary announcements, other apps and malformed titles in the inbox", () => {
    for (const title of ["Hello", "GRIDGO Other 1.0.123 is ready", "GRIDGO Rider https://example.com is ready", " GRIDGO Rider 1.0.123 is ready", null]) {
      expect(releaseNoticeDestination({ type: "announcement" }, title, "apk")).toBeNull();
    }
    expect(releaseNoticeDestination({ type: "order_updated" }, "GRIDGO Rider 1.0.123 is ready", "apk")).toBeNull();
  });
});

describe("showsOnInstall", () => {
  const apk = { type: "announcement", title: "GRIDGO Rider 1.0.185 is ready", releaseChannel: "apk", storeTarget: "apk_download" };
  const legacyApk = { type: "announcement", title: "GRIDGO Rider 1.0.182 is ready" };
  const play = { type: "announcement", title: "GRIDGO Rider 1.0.5 is on the Play Store", releaseChannel: "play", storeTarget: "play_store" };
  const ios = { type: "announcement", title: "GRIDGO Rider 1.0.5 is in TestFlight", releaseChannel: "ios", storeTarget: "testflight" };
  const visible = (channel: "apk" | "play" | "ios" | null) =>
    [apk, legacyApk, play, ios].filter((notice) => showsOnInstall(notice, channel)).map((notice) => notice.title);

  it("shows each install only its own channel's release notices", () => {
    expect(visible("ios")).toEqual([ios.title]);
    expect(visible("play")).toEqual([play.title]);
    expect(visible("apk")).toEqual([apk.title, legacyApk.title]);
  });

  it("shows no release notice where there is no install", () => {
    expect(visible(null)).toEqual([]);
  });

  it("hides a release notice that names no known channel", () => {
    expect(showsOnInstall({ type: "announcement", title: "x", storeTarget: "play_store" }, "play")).toBe(false);
    expect(showsOnInstall({ type: "announcement", title: "x", releaseChannel: "watch", storeTarget: "x" }, "ios")).toBe(false);
  });

  it("keeps every notification that is not a release notice", () => {
    for (const channel of ["apk", "play", "ios", null] as const) {
      expect(showsOnInstall({ type: "announcement", title: "Office closed on Monday" }, channel)).toBe(true);
      expect(showsOnInstall({ type: "order_updated", title: "GRIDGO Rider 1.0.185 is ready" }, channel)).toBe(true);
      expect(showsOnInstall({ title: "Out for delivery" }, channel)).toBe(true);
    }
  });

  it("agrees with the tap: every release notice it shows opens this install's store", () => {
    for (const channel of ["apk", "play", "ios"] as const) {
      for (const notice of [apk, legacyApk, play, ios]) {
        expect(showsOnInstall(notice, channel)).toBe(releaseNoticeDestination(notice, notice.title, channel) !== null);
      }
    }
  });
});

describe("openReleaseDestination", () => {
  it("opens the store app when it takes the link", async () => {
    const open = jest.fn(async () => undefined);
    await openReleaseDestination(PLAY, open);
    expect(open.mock.calls).toEqual([[PLAY.url]]);
  });

  it("falls back to the web page when no app takes the link", async () => {
    const open = jest.fn(async (url: string) => {
      if (url !== TESTFLIGHT.fallbackUrl) throw new Error("no handler");
    });
    await openReleaseDestination(TESTFLIGHT, open);
    expect(open.mock.calls).toEqual([[TESTFLIGHT.url], [TESTFLIGHT.fallbackUrl]]);
  });

  it("never throws, even when nothing opens", async () => {
    const open = jest.fn(async () => {
      throw new Error("no handler");
    });
    await expect(openReleaseDestination(PLAY, open)).resolves.toBeUndefined();
    await expect(openReleaseDestination(APK, open)).resolves.toBeUndefined();
  });
});
