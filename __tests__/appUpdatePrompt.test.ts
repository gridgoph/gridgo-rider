import { readFileSync } from "fs";
import { join } from "path";

import { canPresentUpdateSheet, updateSheetHold } from "@/hooks/useAppUpdateCheck";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useRootNavigationState: jest.fn(),
  useSegments: jest.fn(() => []),
}));

const read = (path: string) => readFileSync(join(__dirname, "..", path), "utf8");

describe("the update prompt", () => {
  it("is mounted from the root shell, so it runs signed in or out", () => {
    const layout = read("app/_layout.tsx");
    expect(layout).toContain("useAppUpdateCheck");
    expect(layout).toMatch(/<AppUpdatePrompt ready=\{!introPlaying\} \/>/);
  });

  it("is the platform's sheet, never a Modal", () => {
    const layout = read("app/_layout.tsx");
    expect(layout).toMatch(/name="app-update" options=\{confirmSheetScreenOptions\}/);
    const route = read("app/app-update.tsx");
    expect(route).not.toMatch(/<Modal\b/);
  });

  it("reads the dev override as the literal Expo inlines", () => {
    // A member access on `env` ships unset: Expo inlines only this spelling.
    expect(read("hooks/useAppUpdateCheck.ts")).toContain(
      "process.env.EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE",
    );
  });

  it("waits for the launch redirect to land and never stacks on another sheet", () => {
    expect(canPresentUpdateSheet([])).toBe(false);
    expect(canPresentUpdateSheet(["sso-callback"])).toBe(false);
    expect(canPresentUpdateSheet(["confirm"])).toBe(false);
    expect(canPresentUpdateSheet(["trip", "start"])).toBe(false);
    expect(canPresentUpdateSheet(["app-update"])).toBe(false);
    expect(canPresentUpdateSheet(["push-permission"])).toBe(false);

    expect(canPresentUpdateSheet(["(auth)", "welcome"])).toBe(true);
    expect(canPresentUpdateSheet(["(tabs)", "active"])).toBe(true);
  });

  it("says which gate is holding a waiting sheet, so a sheet that never shows is diagnosable", () => {
    const clear = {
      ready: true,
      navigatorReady: true,
      appState: "active" as const,
      confirmOpen: false,
      segments: ["(auth)", "welcome"],
    };
    expect(updateSheetHold(clear)).toBeNull();
    expect(updateSheetHold({ ...clear, ready: false })).toBe("the opening is still playing");
    expect(updateSheetHold({ ...clear, navigatorReady: false })).toBe(
      "the navigator has not mounted",
    );
    expect(updateSheetHold({ ...clear, appState: "background" })).toBe(
      "the app is background, not in front",
    );
    expect(updateSheetHold({ ...clear, confirmOpen: true })).toBe("another sheet is open");
    expect(updateSheetHold({ ...clear, segments: [] })).toBe(
      'route "/" is about to be replaced or is a sheet',
    );
  });

  it("does not count the stack being replaced under the sheet as Later", () => {
    const route = read("app/app-update.tsx");
    expect(route).toContain('settleUpdateSheet(replaced ? "interrupted" : "later", { sheet })');
    // The layout keys its stack on the same owner the sheet compares.
    expect(read("app/_layout.tsx")).toContain("useSession((s) => rootStackOwner(s.user))");
  });
});
