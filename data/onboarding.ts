/**
 * Rider onboarding copy.
 *
 * Three beats, in the order a delivery actually moves: the offer arrives,
 * the rider carries the package, the rider proves the handoff. Client and
 * supplier meet their own context in their own apps.
 *
 * The copy names things a Davao pilot rider already recognises — dispatch
 * offers, the check at the supplier's counter, photo proof — rather than
 * describing features in the abstract. No money changes hands at the door, so
 * none of it mentions any.
 */

/** Raster beat, keyed to `images.onboarding`. */
export type OnboardingArt = "offer" | "check" | "proof";

export type OnboardingSlide = {
  id: string;
  /** Position stated in text, so it survives reduced motion and grayscale. */
  step: string;
  title: string;
  body: string;
  /** A clear verb. Changes on the last slide, which is the one that starts. */
  cta: string;
  /** Picture for this beat. */
  art: OnboardingArt;
};

export const onboardingSlides: readonly OnboardingSlide[] = [
  {
    id: "offer",
    step: "01 / 03",
    title: "Work lands on your phone",
    body: "Dispatch offers arrive with pickup, drop-off and pay. Accept the ones you can take; decline the rest.",
    cta: "Next",
    art: "offer",
  },
  {
    id: "carry",
    step: "02 / 03",
    title: "Check it before you carry it",
    body: "Six checks at the supplier's counter — count, spec, defects, packaging, paperwork, sign-off. All six pass or the package stays put.",
    cta: "Next",
    art: "check",
  },
  {
    id: "proof",
    step: "03 / 03",
    title: "Prove the handoff",
    body: "Photograph the package at the door. A delivery is not closed until GRIDGO has that photo — and no money changes hands at the door.",
    cta: "Get Started",
    art: "proof",
  },
] as const;
