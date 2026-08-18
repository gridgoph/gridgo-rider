/**
 * How much room onboarding art gets, and how big it may be drawn in it.
 *
 * The three illustrations are authored at very different proportions — the
 * tallest is half again as tall as it is wide, the widest is landscape — so a
 * single width cap sizes them to wildly different heights. That is what put a
 * pair of legs through the heading: the art was centred in the whole content
 * area and fitted to the width alone, so the tall one simply carried on down
 * into the type.
 *
 * The fix is a stage the art may not leave, and a fit that respects both of its
 * edges. Kept here as plain arithmetic so the guarantee can be tested without
 * a renderer.
 */

/**
 * Share of the content area the stage takes before the copy has been measured.
 * Close enough that the correction on the next frame is not visible.
 */
export const STAGE_SHARE = 0.52;

/** Widest any piece is drawn, however roomy the screen. */
export const ART_MAX_WIDTH = 360;

/** Page padding either side of the art. */
const GUTTER = 32;

/**
 * Breathing room between the art and the heading below it. The art stands on
 * the bottom of the stage, so on the wordiest page this is the whole clearance.
 */
const STAGE_GAP = 24;

/**
 * The stage's height: whatever is left once the copy has its room.
 *
 * Giving the stage a fixed share of the area instead left a hole between the
 * art and the heading on a tall screen, and — worse — was only accidentally
 * safe. A rider running large system text grows the copy upward into a stage
 * whose size never moved, which is the same collision back again. Measuring the
 * copy and handing the art the remainder is what makes the two regions add up
 * to the area at any text size.
 *
 * Zero while the area is still unmeasured — the first web paint reports no
 * height, and a negative dimension is not a valid SVG size.
 */
export function stageHeight(contentHeight: number, copyHeight: number): number {
  if (!Number.isFinite(contentHeight) || contentHeight <= 0) return 0;
  if (!Number.isFinite(copyHeight) || copyHeight <= 0) {
    return Math.round(contentHeight * STAGE_SHARE);
  }
  // Copy taller than the screen leaves no stage at all. Losing the art is the
  // right outcome there; drawing it through the words is not.
  return Math.max(0, Math.round(contentHeight - copyHeight - STAGE_GAP));
}

/** The widest the art may be drawn, before its own aspect is considered. */
export function stageWidth(screenWidth: number): number {
  if (!Number.isFinite(screenWidth)) return 0;
  return Math.max(0, Math.min(screenWidth - GUTTER, ART_MAX_WIDTH));
}

/**
 * Draw size for one piece, fitted inside the stage in both directions.
 *
 * `aspect` is width / height, as the illustration set records it. Whichever
 * edge the art meets first decides the size, so a tall piece is bounded by the
 * stage's height and a wide one by its width — and neither can reach the copy.
 */
export function fitArt(
  availableWidth: number,
  availableHeight: number,
  aspect: number,
): { width: number; height: number } {
  if (!Number.isFinite(aspect) || aspect <= 0) return { width: 0, height: 0 };
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return { width: 0, height: 0 };
  /*
    No stage means nothing is drawn, never "ignore the height and use the width".
    A stage of zero arrives two ways — the area has not been measured yet, and
    the copy has taken all of it — and falling back to the width would answer
    the second with art at full height straight through the heading, which is
    the collision this module exists to prevent.
  */
  if (!Number.isFinite(availableHeight) || availableHeight <= 0) return { width: 0, height: 0 };

  const width = Math.min(availableWidth, availableHeight * aspect);
  return { width, height: width / aspect };
}
