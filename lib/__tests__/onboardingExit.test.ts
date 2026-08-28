import { onboardingShouldPop, resolveOnboardingExit } from "@/lib/onboardingExit";

describe("resolveOnboardingExit", () => {
  it("returns Settings when replayed from Settings", () => {
    expect(resolveOnboardingExit("settings")).toBe("/settings");
    expect(onboardingShouldPop("settings")).toBe(true);
  });

  it("returns Offers when replayed from the wait screen", () => {
    expect(resolveOnboardingExit("offers")).toBe("/(tabs)/offers");
    expect(onboardingShouldPop("offers")).toBe(true);
    expect(onboardingShouldPop(["offers"])).toBe(true);
  });

  it("returns the launcher for first-run and unknown entry", () => {
    expect(resolveOnboardingExit(undefined)).toBe("/");
    expect(resolveOnboardingExit("")).toBe("/");
    expect(resolveOnboardingExit("launch")).toBe("/");
    expect(onboardingShouldPop(undefined)).toBe(false);
  });

  it("reads the first value when expo-router passes an array", () => {
    expect(resolveOnboardingExit(["settings"])).toBe("/settings");
    expect(resolveOnboardingExit(["other", "settings"])).toBe("/");
  });
});
