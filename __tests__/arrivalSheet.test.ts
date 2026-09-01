import { readFileSync } from "fs";
import { join } from "path";

describe("Arrival at the next stop", () => {
  it("is wired from the root shell so it still fires off the Active tab", () => {
    const layout = readFileSync(join(__dirname, "../app/_layout.tsx"), "utf8");
    expect(layout).toContain("useArrivalAlert");
  });

  it("pops GRIDGO's confirmation sheet, never a Modal", () => {
    const hook = readFileSync(join(__dirname, "../hooks/useArrivalAlert.ts"), "utf8");
    expect(hook).toContain("askConfirm");
    expect(hook).not.toMatch(/from ["']react-native["'][\s\S]*\bModal\b/);
    expect(hook).not.toMatch(/<Modal\b/);
  });

  it("also sends a local notification so a pocketed phone still hears it", () => {
    const hook = readFileSync(join(__dirname, "../hooks/useArrivalAlert.ts"), "utf8");
    expect(hook).toContain("presentArrivalNotification");
  });
});
