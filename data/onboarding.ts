/**
 * Rider onboarding copy.
 *
 * Three beats, in the order a delivery actually moves: the offer arrives,
 * the rider carries the package, the rider proves the handoff. Client and
 * supplier meet their own context in their own apps.
 *
 * The copy names things a Davao pilot rider already recognises — dispatch
 * offers, pickup at the supplier, photo proof, COD — rather than describing
 * features in the abstract.
 */

import type { IllustrationName } from "@/components/illustrations";

export type OnboardingSlide = {
  id: string;
  /** Position stated in text, so it survives reduced motion and grayscale. */
  step: string;
  title: string;
  body: string;
  /** A clear verb. Changes on the last slide, which is the one that starts. */
  cta: string;
  /** Which piece of art carries this beat. */
  art: IllustrationName;
};

export const onboardingSlides: readonly OnboardingSlide[] = [
  {
    id: "offer",
    step: "01 / 03",
    title: "Work lands on your phone",
    body: "Dispatch offers arrive with pickup, drop-off and pay. Accept the ones you can take; decline the rest.",
    cta: "Next",
    art: "mobile_guy",
  },
  {
    id: "carry",
    step: "02 / 03",
    title: "Pick up, then deliver",
    body: "Navigate to the supplier, collect the package, and ride it to the client. Share live location while the job is with you.",
    cta: "Next",
    art: "scooter",
  },
  {
    id: "proof",
    step: "03 / 03",
    title: "Prove the handoff",
    body: "Capture photo proof at pickup and delivery. When the job is COD, record the cash you collected before you close it out.",
    cta: "Get Started",
    art: "postman",
  },
] as const;
