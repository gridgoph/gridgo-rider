import { resolveOnboardingExit } from "@/lib/onboardingExit";

describe("resolveOnboardingExit", () => {
  it("returns Settings when replayed from Settings", () => {
    expect(resolveOnboardingExit("settings")).toBe("/settings");
  });

  it("returns the launcher for first-run and unknown entry", () => {
    expect(resolveOnboardingExit(undefined)).toBe("/");
    expect(resolveOnboardingExit("")).toBe("/");
    expect(resolveOnboardingExit("launch")).toBe("/");
  });

  it("reads the first value when expo-router passes an array", () => {
    expect(resolveOnboardingExit(["settings"])).toBe("/settings");
    expect(resolveOnboardingExit(["other", "settings"])).toBe("/");
  });
});
