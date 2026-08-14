import { isLaunchReady, pendingLaunchWork } from "@/lib/launchGate";

describe("Clerk launch gate", () => {
  it("waits for Clerk to restore its SecureStore session", () => {
    expect(
      isLaunchReady({
        fontsReady: true,
        sessionHydrated: true,
        identityReady: false,
        deadlinePassed: false,
      }),
    ).toBe(false);
    expect(
      pendingLaunchWork({
        fontsReady: true,
        sessionHydrated: true,
        identityReady: false,
      }),
    ).toContain("Clerk session");
  });

  it("still renders after the bounded launch deadline", () => {
    expect(
      isLaunchReady({
        fontsReady: false,
        sessionHydrated: false,
        identityReady: false,
        deadlinePassed: true,
      }),
    ).toBe(true);
  });
});
