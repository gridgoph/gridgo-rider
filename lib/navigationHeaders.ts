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
