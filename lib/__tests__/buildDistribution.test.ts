import { buildDistribution } from "@/lib/buildDistribution";

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
