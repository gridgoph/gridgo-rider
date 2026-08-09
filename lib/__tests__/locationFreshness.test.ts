import { classifyLocation, formatAge, STALE_FIX_MS } from "@/lib/locationFreshness";

const NOW = Date.parse("2026-08-10T02:00:00.000Z");

describe("classifyLocation", () => {
  it("says location is off when permission was refused", () => {
    const result = classifyLocation({ fixAtMs: NOW, nowMs: NOW, permission: "denied" });
    expect(result.level).toBe("off");
    expect(result.label).toMatch(/off/i);
    expect(result.detail).toMatch(/settings/i);
  });

  it("waits rather than inventing a position", () => {
    const result = classifyLocation({ fixAtMs: null, nowMs: NOW, permission: "granted" });
    expect(result.level).toBe("waiting");
    expect(result.label).not.toMatch(/live/i);
  });

  it("calls a recent fix live and includes its accuracy", () => {
    const result = classifyLocation({
      fixAtMs: NOW - 6_000,
      nowMs: NOW,
      permission: "granted",
      accuracyMetres: 11.4,
    });
    expect(result.level).toBe("live");
    expect(result.label).toContain("6s ago");
    expect(result.label).toContain("within 11 m");
  });

  it("labels a fix stale the moment it crosses the threshold", () => {
    const justFresh = classifyLocation({
      fixAtMs: NOW - (STALE_FIX_MS - 1),
      nowMs: NOW,
      permission: "granted",
    });
    const justStale = classifyLocation({
      fixAtMs: NOW - STALE_FIX_MS,
      nowMs: NOW,
      permission: "granted",
    });
    expect(justFresh.level).toBe("live");
    expect(justStale.level).toBe("stale");
    expect(justStale.label).toMatch(/stale/i);
  });

  it("carries an icon and a label with every tone, so colour is never alone", () => {
    const cases = [
      { fixAtMs: NOW, nowMs: NOW, permission: "granted" as const },
      { fixAtMs: NOW - 600_000, nowMs: NOW, permission: "granted" as const },
      { fixAtMs: null, nowMs: NOW, permission: "granted" as const },
      { fixAtMs: null, nowMs: NOW, permission: "denied" as const },
    ];
    for (const input of cases) {
      const result = classifyLocation(input);
      expect(result.icon).toBeTruthy();
      expect(result.label.length).toBeGreaterThan(0);
    }
  });

  it("does not report a fix from the future as aged", () => {
    const result = classifyLocation({ fixAtMs: NOW + 5_000, nowMs: NOW, permission: "granted" });
    expect(result.level).toBe("live");
    expect(result.label).toContain("0s ago");
  });
});

describe("formatAge", () => {
  it("steps from seconds to minutes to hours", () => {
    expect(formatAge(3_000)).toBe("3s ago");
    expect(formatAge(90_000)).toBe("1 min ago");
    expect(formatAge(3 * 3_600_000)).toBe("3h ago");
  });
});
