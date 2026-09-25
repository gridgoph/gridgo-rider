import { readFileSync } from "fs";
import { join } from "path";

/**
 * Where a rider who said "Not now" finds notifications again.
 *
 * The explainer is one sheet a week at most; between times the recovery is
 * `PushEnableCard` on the screen launch lands on. Moving the launch redirect
 * to a tab without the card would quietly leave "Not now" riders with no way
 * back short of opening Alerts, which is how production ended up with almost
 * no rider phones registered.
 */

const read = (path: string) => readFileSync(join(__dirname, "..", path), "utf8");

describe("the notifications recovery on the landing screen", () => {
  const landing = read("app/index.tsx").match(/if \(user\) return <Redirect href="\/([^"]+)"/)?.[1];

  it("finds where a signed-in launch lands", () => {
    expect(landing).toBe("(tabs)/active");
  });

  it("draws the card there, whatever state the trip is in", () => {
    const screen = read(`app/${landing}.tsx`);
    // Unconditional: not inside the approved-only branch or the trip branch.
    expect(screen).toMatch(/\n {8}<PushEnableCard \/>\n/);
  });

  it("keeps it on Offers and Alerts too", () => {
    expect(read("app/(tabs)/offers.tsx")).toContain("<PushEnableCard");
    expect(read("app/alerts.tsx")).toContain("<PushEnableCard");
  });

  it("mounts the explainer from the root shell as the platform's sheet", () => {
    const layout = read("app/_layout.tsx");
    expect(layout).toMatch(/<PushPrompt ready=\{!introPlaying\} \/>/);
    expect(layout).toMatch(/name="push-permission" options=\{confirmSheetScreenOptions\}/);
    expect(read("app/push-permission.tsx")).not.toMatch(/<Modal\b/);
  });

  it("keeps the update sheet from stacking on it", () => {
    expect(read("hooks/useAppUpdateCheck.ts")).toContain('"push-permission"');
  });
});
