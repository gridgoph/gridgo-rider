import { readFileSync } from "fs";
import { join } from "path";

describe("Sign out confirmation", () => {
  it("asks through the platform sheet, not a Modal drawn on Account", () => {
    const source = readFileSync(
      join(__dirname, "../app/(tabs)/account.tsx"),
      "utf8",
    );
    expect(source).toContain("askConfirm");
    expect(source).toContain("Sign out of GRIDGO on this phone?");
    expect(source).not.toContain("ConfirmModal");
    expect(source).not.toContain('router.push("/sign-out")');
  });

  it("names the consequence of signing out while a job is still with the rider", () => {
    const source = readFileSync(
      join(__dirname, "../app/(tabs)/account.tsx"),
      "utf8",
    );
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
