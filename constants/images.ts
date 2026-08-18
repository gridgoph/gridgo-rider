import type { OnboardingArt } from "@/data/onboarding";

/**
 * Raster images, required in one place.
 *
 * Screens and components take `images.*` from here — they do not `require`
 * an asset themselves. Metro wants a static `require` of a string literal,
 * so each file is named here, not discovered.
 */
export const images = {
  onboarding: {
    offer: require("../assets/images/onboarding/offer.png"),
    check: require("../assets/images/onboarding/check.png"),
    proof: require("../assets/images/onboarding/proof.png"),
  } satisfies Record<OnboardingArt, number>,
};
