import { buildDistribution, installChannel } from "@/lib/buildDistribution";

afterEach(() => {
  delete process.env.EXPO_PUBLIC_APP_DISTRIBUTION;
});

describe("buildDistribution", () => {
  it("is the side-load APK unless the build says play", () => {
    expect(buildDistribution()).toBe("sideload");
    process.env.EXPO_PUBLIC_APP_DISTRIBUTION = "sideload";
    expect(buildDistribution()).toBe("sideload");
  });

  it("is a Google Play build when CI sets the Play flag", () => {
    process.env.EXPO_PUBLIC_APP_DISTRIBUTION = "play";
    expect(buildDistribution()).toBe("play");
  });
});

describe("installChannel", () => {
  it("is the side-load APK on an Android build without the Play flag", () => {
    expect(installChannel("android", "sideload")).toBe("apk");
  });

  it("is play on the Google Play bundle", () => {
    expect(installChannel("android", "play")).toBe("play");
    process.env.EXPO_PUBLIC_APP_DISTRIBUTION = "play";
    expect(installChannel("android")).toBe("play");
  });

  it("is ios on every iPhone build, which only TestFlight installs", () => {
    expect(installChannel("ios", "sideload")).toBe("ios");
    expect(installChannel("ios", "play")).toBe("ios");
  });

  it("reports nothing for web, which is not an install", () => {
    expect(installChannel("web", "sideload")).toBeNull();
  });
});
