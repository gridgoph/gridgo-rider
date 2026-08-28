import {
  ONBOARDING_CHROME_FOOTER,
  ONBOARDING_CHROME_HEADER,
  estimatePagerHeight,
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


