/**
 * Where onboarding should land when the rider finishes or skips.
 *
 * Never send a signed-in replay through `/`. That remounts the tab shell
 * via the launch redirect — a blank hop, then Active — which is the
 * noticeable pause on “Get Started”.
 *
 * Settings replay returns to Settings. Offers replay returns to Offers.
 * First-run / deep-link still dismisses to the launcher.
 */

export type OnboardingExit = "/settings" | "/(tabs)/offers" | "/";

/**
 * @param from - `useLocalSearchParams().from`, when present
 */
export function resolveOnboardingExit(from: string | string[] | undefined): OnboardingExit {
  const value = Array.isArray(from) ? from[0] : from;
  if (value === "settings") return "/settings";
  if (value === "offers") return "/(tabs)/offers";
  return "/";
}

/** Pushed replays can pop. First-run has nothing useful behind it. */
export function onboardingShouldPop(from: string | string[] | undefined): boolean {
  const value = Array.isArray(from) ? from[0] : from;
  return value === "settings" || value === "offers";
}
