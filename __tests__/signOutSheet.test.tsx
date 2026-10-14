import { readFileSync } from "fs";
import { join } from "path";

// Account and the agreement screen share one sign-out confirmation.
const signOutSource = () =>
  readFileSync(join(__dirname, "../hooks/useConfirmedSignOut.ts"), "utf8");

describe("Sign out confirmation", () => {
  it("is the shared confirmation on Account and on the agreement screen", () => {
    for (const screen of ["../app/(tabs)/account.tsx", "../app/legal/review.tsx"]) {
      const source = readFileSync(join(__dirname, screen), "utf8");
      expect(source).toContain("useConfirmedSignOut");
      expect(source).not.toContain("ConfirmModal");
      expect(source).not.toContain('router.push("/sign-out")');
    }
  });

  it("asks through the platform sheet, not a Modal drawn on Account", () => {
    const source = signOutSource();
    expect(source).toContain("askConfirm");
    expect(source).toContain("Sign out of GRIDGO on this phone?");
    expect(source).not.toContain("ConfirmModal");
    expect(source).not.toContain('router.push("/sign-out")');
  });

  it("names the consequence of signing out while a job is still with the rider", () => {
    const source = signOutSource();
    expect(source).toMatch(/stop sharing your position/);
    expect(source).toMatch(/Offers stop arriving/);
    expect(source).not.toMatch(/Are you sure/i);
  });
});

describe("confirmation actions sit as a pair", () => {
  it("gives Stay signed in the same large target as Sign out", () => {
    const source = readFileSync(join(__dirname, "../app/confirm.tsx"), "utf8");
    expect(source).toMatch(/DangerButton[\s\S]*size="large"/);
    expect(source).toMatch(/SecondaryButton[\s\S]*size="large"/);
    expect(source).toContain("cancelLabel={cancelLabel}");
  });
});
