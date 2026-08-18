import { images } from "@/constants/images";
import { onboardingSlides } from "@/data/onboarding";

describe("images", () => {
  it("registers the welcome scooter", () => {
    expect(images.welcome).toBeDefined();
  });

  it("registers a picture for every onboarding beat", () => {
    for (const slide of onboardingSlides) {
      expect(images.onboarding[slide.art]).toBeDefined();
    }
  });
});
