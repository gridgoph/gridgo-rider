import { readFileSync } from "fs";
import { join } from "path";

import { canPresentUpdateSheet } from "@/hooks/useAppUpdateCheck";

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

    expect(canPresentUpdateSheet(["(auth)", "welcome"])).toBe(true);
    expect(canPresentUpdateSheet(["(tabs)", "active"])).toBe(true);
  });
});
