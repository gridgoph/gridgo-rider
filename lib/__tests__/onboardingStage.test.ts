import { illustrations } from "@/components/illustrations";
import { onboardingSlides } from "@/data/onboarding";
import {
  ART_MAX_WIDTH,
  STAGE_SHARE,
  fitArt,
  stageHeight,
  stageWidth,
} from "@/lib/onboardingStage";

/**
 * The onboarding art used to be fitted to the width alone and centred in the
 * whole content area, so the tallest piece ran down through the step number,
 * the hairline and the heading. These fix the shape of the stage rather than
 * the one screen size the bug was noticed on.
 */

/** A range of real handsets, shortest to tallest content area. */
const SCREENS = [
  { name: "small", width: 320, content: 460 },
  { name: "moto g power", width: 412, content: 660 },
  { name: "tall", width: 430, content: 780 },
];

/** A measured copy block: step number, two-line heading, three-line body. */
const COPY = 180;

describe("the onboarding stage", () => {
  it("never draws a piece taller than the stage", () => {
    for (const screen of SCREENS) {
      const height = stageHeight(screen.content, COPY);
      const width = stageWidth(screen.width);
      for (const slide of onboardingSlides) {
        const art = fitArt(width, height, illustrations[slide.art].aspect);
        expect(art.height).toBeLessThanOrEqual(height + 0.01);
        expect(art.width).toBeLessThanOrEqual(width + 0.01);
      }
    }
  });

  it("leaves the copy its measured room on every screen", () => {
    for (const screen of SCREENS) {
      // Stage plus copy must never exceed the area, or the art is drawn over
      // the words — the overlap this guards.
      expect(stageHeight(screen.content, COPY) + COPY).toBeLessThanOrEqual(screen.content);
    }
  });

  it("fills the area rather than leaving a hole above the heading", () => {
    // The stage takes everything the copy does not, give or take the gap
    // between them.
    const content = 700;
    expect(stageHeight(content, COPY)).toBe(content - COPY - 24);
  });

  it("gives up the art rather than drawing it through very large text", () => {
    // A rider running the largest system text can push the copy past the area.
    expect(stageHeight(500, 600)).toBe(0);
    expect(fitArt(360, 0, 0.7).height).toBe(0);
  });

  it("falls back to a share of the area until the copy is measured", () => {
    expect(stageHeight(700, 0)).toBe(Math.round(700 * STAGE_SHARE));
  });

  it("keeps each piece's proportions", () => {
    for (const slide of onboardingSlides) {
      const { aspect } = illustrations[slide.art];
      const art = fitArt(360, 300, aspect);
      expect(art.width / art.height).toBeCloseTo(aspect, 5);
    }
  });

  it("bounds a tall piece by the height and a wide one by the width", () => {
    // Portrait: 300 of height allows only 210 of width, well under the 360 cap.
    expect(fitArt(360, 300, 0.7).width).toBeCloseTo(210, 5);
    // Landscape: the width binds first and the height comes in under the stage.
    const wide = fitArt(360, 300, 1.3);
    expect(wide.width).toBe(360);
    expect(wide.height).toBeLessThan(300);
  });

  it("caps the width on a roomy screen and leaves gutters on a narrow one", () => {
    expect(stageWidth(1024)).toBe(ART_MAX_WIDTH);
    // Wide enough that the cap binds before the gutters do.
    expect(stageWidth(412)).toBe(ART_MAX_WIDTH);
    // Narrow enough that the gutters bind first.
    expect(stageWidth(360)).toBe(328);
  });

  it("reports nothing while the layout is still unmeasured", () => {
    // The first web paint reports no size, and a negative dimension is not a
    // valid SVG one.
    expect(stageHeight(0, COPY)).toBe(0);
    expect(stageHeight(-100, COPY)).toBe(0);
    expect(stageWidth(0)).toBe(0);
    expect(fitArt(0, 0, 1)).toEqual({ width: 0, height: 0 });
    // No stage, nothing drawn — never the full-height fallback that would put
    // the art through the heading.
    expect(fitArt(360, 0, 0.7)).toEqual({ width: 0, height: 0 });
  });
});
