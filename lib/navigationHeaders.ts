import { radius } from "@/constants/theme";

/**
 * Shared header options for screens pushed above the tab shell.
 *
 * On iOS the native stack labels the back control with the previous screen's
 * title. The tab group route is the filesystem name `(tabs)`, which must never
 * reach the user, and these screens open from more than one tab anyway, so a
 * single origin label would also be a lie.
 *
 * The old fix was `headerBackButtonDisplayMode: "minimal"` — chevron, no words.
 * It kept `(tabs)` off the screen and it is what iOS does inside a single-origin
 * flow, but riders reported not finding the way back: a bare chevron on a dense
 * proof screen, in daylight, at a gate, is a 24pt glyph in a corner. "Back" is
 * two syllables of certainty and costs nothing.
 *
 * So the label is set explicitly rather than inherited. `headerBackTitle`
 * replaces the previous screen's title outright, which is what makes this safe:
 * the origin is never consulted, so `(tabs)` cannot leak whatever the rider
 * came from. `(tabs)` also carries a real `title` in `app/_layout.tsx` as a
 * second line of defence.
 *
 * `headerBackTitle` is iOS-only by design. Android's own convention is the
 * unlabelled arrow, which is what every other Android app there gives them, and
 * the platform draws it for us.
 */
export const multiOriginPushedScreenOptions = {
  headerBackButtonDisplayMode: "default" as const,
  headerBackTitle: "Back",
};

/**
 * A confirmation presented as the platform's own sheet.
 *
 * `formSheet` gives iOS a UIKit sheet with detents and Android a Material
 * bottom sheet (react-native-screens ≥ 4 implements it with
 * `BottomSheetBehavior`, not a full-screen modal). Both bring what a
 * hand-rolled `<Modal>` cannot: interruptible spring motion that tracks the
 * finger, drag-to-dismiss, the Android back gesture, a real scrim, and a
 * screen-reader focus trap that keeps the content behind it unreachable. The
 * system also honours "reduce motion" on its own, degrading the transition
 * without us branching on it.
 *
 * `fitToContents` sizes the sheet to what is in it, so a two-line question
 * does not open a full-height panel. It also means the sheet's height is the
 * content's height — a loading state shorter than the answer makes the panel
 * grow from the bottom edge as it lands, so every sheet's loading state holds
 * the final height (`ConfirmSheetSkeleton`).
 *
 * These sheets carry no header: each one is a single question whose text is
 * the first thing inside it, and a navigation bar above that would repeat it.
 * Each one keeps a labelled cancel in its body instead, in every state.
 */
export const confirmSheetScreenOptions = {
  presentation: "formSheet" as const,
  sheetAllowedDetents: "fitToContents" as const,
  sheetGrabberVisible: true,
  // The design system's largest radius, not a number that happens to match it.
  sheetCornerRadius: radius.xl,
  headerShown: false,
  // Dimming at every detent: the screen behind a confirmation is not something
  // the rider should be reaching past.
  sheetLargestUndimmedDetentIndex: "none" as const,
};
