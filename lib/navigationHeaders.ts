/**
 * Shared header options for screens pushed above the tab shell.
 *
 * On iOS, the native stack labels the back control with the previous screen's
 * title. The tab group route is the filesystem name `(tabs)`, which must never
 * reach the user. Screens can also be opened from more than one tab, so a
 * single origin label would be a lie.
 *
 * `headerBackButtonDisplayMode: "minimal"` keeps the chevron only. The control
 * still has a system accessibility name ("Back" / "Go back") for VoiceOver.
 * Prefer this over the removed `headerBackTitleVisible` option.
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
 * does not open a full-height panel.
 *
 * These sheets carry no header: each one is a single question whose text is
 * the first thing inside it, and a navigation bar above that would repeat it.
 */
export const confirmSheetScreenOptions = {
  presentation: "formSheet" as const,
  sheetAllowedDetents: "fitToContents" as const,
  sheetGrabberVisible: true,
  sheetCornerRadius: 24,
  headerShown: false,
  // Dimming at every detent: the screen behind a confirmation is not something
  // the rider should be reaching past.
  sheetLargestUndimmedDetentIndex: "none" as const,
};
