/**
 * First-frame pager height so the copy sits at the bottom before onLayout.
 *
 * Slides use `justify-end` (via flex on the mark, copy below) to pin the
 * words above the dots. With no height they collapse and the words paint
 * under the logo, then jump down when the measure lands. This estimate is
 * the window minus safe area minus the two chrome bands, so the first frame
 * already has a bottom.
 *
 * A few pixels off is invisible; height 0 is the jump from the header to
 * the footer.
 */

export const ONBOARDING_CHROME_HEADER = 80;
export const ONBOARDING_CHROME_FOOTER = 120;

export function estimatePagerHeight(
  windowHeight: number,
  insetTop: number,
  insetBottom: number,
): number {
  if (!Number.isFinite(windowHeight) || windowHeight <= 0) return 0;
  const top = Number.isFinite(insetTop) ? Math.max(0, insetTop) : 0;
  const bottom = Number.isFinite(insetBottom) ? Math.max(0, insetBottom) : 0;
  return Math.max(
    0,
    Math.round(
      windowHeight - top - bottom - ONBOARDING_CHROME_HEADER - ONBOARDING_CHROME_FOOTER,
    ),
  );
}

/** Cap so a tablet does not get a billboard. */
const MARK_MAX = 340;
/** Share of screen width the field may take. */
const MARK_WIDTH_SHARE = 0.8;
/**
 * Share of the pager the field may take. Leaves the copy its room without
 * measuring it — the mark sits in flex, the words sit under it.
 */
const MARK_PAGER_SHARE = 0.62;

/**
 * Hero field size: large enough to read as the picture, small enough that
 * the heading never has to fight it.
 */
export function onboardingMarkSize(screenWidth: number, pagerHeight: number): number {
  if (!Number.isFinite(screenWidth) || screenWidth <= 0) return 0;
  if (!Number.isFinite(pagerHeight) || pagerHeight <= 0) return 0;
  return Math.max(
    0,
    Math.round(
      Math.min(screenWidth * MARK_WIDTH_SHARE, pagerHeight * MARK_PAGER_SHARE, MARK_MAX),
    ),
  );
}
