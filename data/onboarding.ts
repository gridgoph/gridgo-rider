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

/** A slide's picture: a raster beat, or the scooter drawing on the bubble ask. */
export type OnboardingPicture = OnboardingArt | "bubble";

export type OnboardingSlide = {
  id: string;
  /** Position stated in text, so it survives reduced motion and grayscale. */
  step: string;
  title: string;
  body: string;
  /** A clear verb. Changes on the last slide, which is the one that starts. */
  cta: string;
  /** Picture for this beat. */
  art: OnboardingPicture;
};

export const onboardingSlides: readonly (OnboardingSlide & { art: OnboardingArt })[] = [
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

/**
 * The delivery bubble ask (`lib/tripBubble.ts`), Android only and only while
 * the phone has not allowed it. It comes last because it is the one page that
 * asks for something, and its button opens the phone's own "Display over other
 * apps" list: Android has no dialog for it, and from Android 11 it will not
 * open on one app's switch, so the body says to pick GRIDGO Rider there.
 */
const bubbleSlide: OnboardingSlide = {
  id: "bubble",
  step: "",
  title: "Back to the job in one tap",
  body: "During a delivery, a small GRIDGO bubble can sit over your map app. Tap it to come back to the order; its number counts new messages and updates. Next, pick GRIDGO Rider in the list and turn it on. Say no and everything else still works.",
  cta: "Allow the bubble",
  art: "bubble",
};

const pad = (n: number) => String(n).padStart(2, "0");

/** The pages to show: the three beats, plus the bubble ask when it applies. */
export function onboardingSlidesFor({ bubble }: { bubble: boolean }): readonly OnboardingSlide[] {
  if (!bubble) return onboardingSlides;
  const slides = [...onboardingSlides.map((slide) => ({ ...slide, cta: "Next" })), bubbleSlide];
  return slides.map((slide, index) => ({
    ...slide,
    step: `${pad(index + 1)} / ${pad(slides.length)}`,
  }));
}
