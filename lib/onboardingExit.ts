/**
 * Where onboarding should land when the rider finishes or skips.
 *
 * Two entry points, two exits — never leave the destination to navigation
 * history alone. Settings replay must return to Settings; first-run /
 * deep-link entry dismisses to the app launcher.
 */

export type OnboardingExit = "/settings" | "/";

/**
 * @param from - `useLocalSearchParams().from`, when present
 */
export function resolveOnboardingExit(from: string | string[] | undefined): OnboardingExit {
  const value = Array.isArray(from) ? from[0] : from;
  if (value === "settings") return "/settings";
  return "/";
}
