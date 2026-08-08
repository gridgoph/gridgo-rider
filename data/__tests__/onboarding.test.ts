import { illustrations } from "@/components/illustrations";
import { onboardingSlides } from "@/data/onboarding";

describe("onboardingSlides", () => {
  it("has three sequential beats with step labels", () => {
    expect(onboardingSlides).toHaveLength(3);
    expect(onboardingSlides.map((s) => s.step)).toEqual(["01 / 03", "02 / 03", "03 / 03"]);
  });

  it("uses rider art keys registered in the illustration set", () => {
    for (const slide of onboardingSlides) {
      expect(illustrations[slide.art]).toBeDefined();
    }
    expect(onboardingSlides.map((s) => s.art)).toEqual(["mobile_guy", "scooter", "postman"]);
  });

  it("ends with a start verb on the last slide only", () => {
    expect(onboardingSlides[0].cta).toBe("Next");
    expect(onboardingSlides[1].cta).toBe("Next");
    expect(onboardingSlides[2].cta).toBe("Get Started");
  });

  it("keeps every id unique", () => {
    const ids = onboardingSlides.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
