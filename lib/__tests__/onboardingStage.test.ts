import {
  ONBOARDING_CHROME_FOOTER,
  ONBOARDING_CHROME_HEADER,
  estimatePagerHeight,
  onboardingMarkSize,
} from "@/lib/onboardingStage";

describe("the onboarding pager estimate", () => {
  it("gives the first frame a pager height so the copy is not at the top", () => {
    // moto g power-ish: 892 tall, 47 status, 48 gesture.
    const estimated = estimatePagerHeight(892, 47, 48);
    expect(estimated).toBe(
      892 - 47 - 48 - ONBOARDING_CHROME_HEADER - ONBOARDING_CHROME_FOOTER,
    );
    expect(estimated).toBeGreaterThan(400);
  });

  it("reports nothing while the window is still unmeasured", () => {
    expect(estimatePagerHeight(0, 47, 48)).toBe(0);
    expect(estimatePagerHeight(-100, 47, 48)).toBe(0);
  });
});

describe("the onboarding mark size", () => {
  it("fills most of a phone width without covering the copy", () => {
    // moto g power: ~412 wide, ~600 pager after chrome.
    const size = onboardingMarkSize(412, 600);
    expect(size).toBe(Math.round(412 * 0.8));
    expect(size).toBeGreaterThan(300);
    expect(size).toBeLessThan(600 * 0.62 + 1);
  });

  it("shrinks on a short pager so the heading still has room", () => {
    expect(onboardingMarkSize(412, 360)).toBe(Math.round(360 * 0.62));
  });

  it("reports nothing while layout is unmeasured", () => {
    expect(onboardingMarkSize(0, 600)).toBe(0);
    expect(onboardingMarkSize(412, 0)).toBe(0);
  });
});
