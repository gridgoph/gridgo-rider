import { readFileSync } from "fs";
import { join } from "path";

/**
 * Where a rider who said "Not now" finds notifications again.
 *
 * The explainer is one sheet a week at most; between times the recovery is
 * `PushEnableCard`, one tap from the screen launch lands on. The map home
 * folds every warning into one chip (#180), so the landing draws the chip —
 * which counts alerts that are off — and the chip's screen draws the card.
 * Losing either would quietly leave "Not now" riders with no way back short
 * of opening Alerts, which is how production ended up with almost no rider
 * phones registered.
 */

const read = (path: string) => readFileSync(join(__dirname, "..", path), "utf8");

describe("the notifications recovery on the landing screen", () => {
  const landing = read("app/index.tsx").match(/if \(user\) return <Redirect href="\/([^"]+)"/)?.[1];

  it("finds where a signed-in launch lands", () => {
    expect(landing).toBe("(tabs)/map");
  });

  it("puts the card one tap away there, whatever state the trip is in", () => {
    const screen = read(`app/${landing}.tsx`);
    expect(screen).toContain("useAttention(");
    expect(screen).toMatch(/\{attention \? <AttentionChip summary=\{attention\} \/> : null\}/);
    expect(read("hooks/useAttention.ts")).toMatch(/pushOffer\(/);
    // Unconditional on the chip's screen: not inside any approval or trip branch.
    expect(read("app/attention.tsx")).toMatch(/\n {8}<PushEnableCard \/>\n/);
  });

  it("keeps it on Jobs and Alerts too", () => {
    expect(read("app/(tabs)/jobs.tsx")).toContain("<PushEnableCard");
    expect(read("app/alerts.tsx")).toContain("<PushEnableCard");
  });

  it("mounts the explainer from the root shell as the platform's sheet", () => {
    const layout = read("app/_layout.tsx");
    expect(layout).toMatch(/<PushPrompt ready=\{!introPlaying && !blocked\} \/>/);
    expect(layout).toMatch(/name="push-permission" options=\{\{ \.\.\.confirmSheetScreenOptions, contentStyle: sheetContent \}\}/);
    expect(read("app/push-permission.tsx")).not.toMatch(/<Modal\b/);
  });

  it("keeps the update sheet from stacking on it", () => {
    expect(read("hooks/useAppUpdateCheck.ts")).toContain('"push-permission"');
  });
});
