import { openReleaseDestination, releaseNoticeDestination } from "../releasePush";

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
