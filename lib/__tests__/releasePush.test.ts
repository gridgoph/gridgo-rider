import { releasePushDownloadUrl } from "../releasePush";

test("a release tap opens this app's fixed download without needing an account", () => {
  expect(releasePushDownloadUrl({ type: "announcement" }, "GRIDGO Rider 1.0.123 is ready")).toBe("https://gridgo.talasora.com/downloads/gridgo-rider.apk");
});
test("ordinary announcements, other apps and malformed titles stay in the inbox", () => {
  for (const title of ["Hello", "GRIDGO Other 1.0.123 is ready", "GRIDGO Rider https://example.com is ready", null]) {
    expect(releasePushDownloadUrl({ type: "announcement" }, title)).toBeNull();
  }
  expect(releasePushDownloadUrl({ type: "order_updated" }, "GRIDGO Rider 1.0.123 is ready")).toBeNull();
});
test("a Google Play build never opens the side-load APK from a release push", () => {
  expect(releasePushDownloadUrl({ type: "announcement" }, "GRIDGO Rider 1.0.123 is ready", "play")).toBeNull();
  expect(releasePushDownloadUrl({ type: "announcement" }, "GRIDGO Rider 1.0.123 is ready", "sideload")).toBe("https://gridgo.talasora.com/downloads/gridgo-rider.apk");
});
