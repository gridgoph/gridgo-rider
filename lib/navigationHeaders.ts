import { radius } from "@/constants/theme";

/**
 * Shared header options for screens pushed above the tab shell.
 *
 * On iOS the native stack labels the back control with the previous screen's
 * title. The tab group route is the filesystem name `(tabs)`, which must never
 * reach the user, and these screens open from more than one tab anyway, so a
 * single origin label would also be a lie.
 *
 * `minimal` draws the chevron and no words, which solves both at once: there is
 * no label, so there is no origin title to leak. This build briefly set
 * `headerBackTitle: "Back"` after riders reported missing the bare chevron; the
 * captain has since overruled that and asked for the chevron alone, which is
 * also what iOS itself does inside a flow. The protection is unchanged — with
 * no label, `(tabs)` cannot appear — and `(tabs)` still carries a real `title`
 * in `app/_layout.tsx` as a second line of defence for any option object that
 * ever forgets this one.
 *
 * `headerBackButtonDisplayMode` is iOS-only by design. Android's own convention
 * is the unlabelled arrow, which the platform draws for us.
 */
export const multiOriginPushedScreenOptions = {
  headerBackButtonDisplayMode: "minimal" as const,
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


/**
 * A screen that owns its whole surface.
 *
 * One case so far: the trip map. A header would take the top of a display a
 * rider is reading a road on, and the map has to be the display — inside a
 * scrolling page it cannot even be panned, because the page claims the drag.
 *
 * The trade is that the platform draws no back control, so a screen using this
 * carries its own labelled close in its body, in every state, the same
 * contract a confirmation sheet keeps. `__tests__/backAffordance.test.ts`
 * holds it to that rather than taking the promise on trust.
 */
export const fullBleedScreenOptions = {
  headerShown: false,
  // The gesture still works, so the close control is the second way out
  // rather than the only one.
  gestureEnabled: true,
};
