import { MobileGuyIllustration } from "./MobileGuyIllustration";
import { PostmanIllustration } from "./PostmanIllustration";
import { ScooterIllustration } from "./ScooterIllustration";
import type { IllustrationPalette } from "./palette";

export type { IllustrationPalette };

/**
 * Rider illustration set, keyed by the beat each one carries.
 *
 * Every piece is drawn in one construction — thick outline, flat fill — so
 * the three read as one system once they are recoloured onto the shared ramp.
 *
 * Aspect travels with the art because the source viewBoxes differ, and a
 * screen should only have to choose a width.
 */

type Illustration = {
  Component: (props: {
    width: number;
    height: number;
    palette: IllustrationPalette;
  }) => React.JSX.Element;
  /** width / height, from the source viewBox. */
  aspect: number;
};

export const illustrations = {
  /** Offer — a dispatch job lands on the rider phone. */
  mobile_guy: { Component: MobileGuyIllustration, aspect: 773.55 / 829.5 },
  /** Carry — the rider bringing the finished job to the door. */
  scooter: { Component: ScooterIllustration, aspect: 659.89 / 509.94 },
  /** Proof — handoff complete; the job is delivered. */
  postman: { Component: PostmanIllustration, aspect: 772.36 / 1073.16 },
} satisfies Record<string, Illustration>;

export type IllustrationName = keyof typeof illustrations;
