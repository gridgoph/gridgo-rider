/**
 * Session → route mapping for the rider app.
 *
 * Pure helpers so the routing layer and unit tests share one source of truth.
 * The root layout re-evaluates this whenever the session or segments change —
 * not only at cold launch — so sign-out, expired tokens, and 401s all leave
 * the authenticated area.
 */

/** Destinations the gate may emit. Always use replace, never push. */
export type AuthRedirect =
  | "/(auth)/welcome"
  | "/(tabs)/active"
  | null;

/**
 * Route groups / top-level segments that require a signed-in rider.
 * Anything else is treated as public (login, onboarding, index).
 */
export const PROTECTED_ROOTS = new Set([
  "(tabs)",
  "design-system",
  "settings",
  // Alerts and every trip step read a rider's own job — they are as protected
  // as the tab shell, and a deep link is how someone would land on them.
  "alerts",
  "trip",
]);

/** Auth-only surfaces — a signed-in rider should not linger here. */
export const AUTH_ROOTS = new Set(["(auth)"]);

/**
 * Whether the gate is allowed to navigate at all yet.
 *
 * Two things have to be true before a redirect is safe, and both were missing:
 *
 * 1. **The root navigator is mounted.** `router.replace` before the navigation
 *    container is ready throws "Attempted to navigate before mounting the Root
 *    Layout component", which in a release build is a blank screen and in
 *    development is the red LogBox over the whole app. It reproduces on every
 *    cold start that begins on a protected route — a deep link, a notification
 *    tap, or a browser reload on Expo web.
 * 2. **The stored session has been read back.** Until AsyncStorage answers, a
 *    signed-in rider looks signed out, and the gate would throw them to welcome
 *    a frame before their own session arrives.
 */
export function canGateNavigate(input: {
  /** Truthy key from `useRootNavigationState()` once the navigator exists. */
  rootNavigatorKey: string | undefined | null;
  /** Whether the persisted session has been read back yet. */
  sessionHydrated: boolean;
}): boolean {
  return Boolean(input.rootNavigatorKey) && input.sessionHydrated;
}

/**
 * Decide whether to leave the current route given session + segments.
 *
 * @param isSignedIn - session has a rider user
 * @param segments - expo-router useSegments() result (e.g. ["(tabs)", "active"])
 */
export function resolveAuthRedirect(
  isSignedIn: boolean,
  segments: readonly string[],
): AuthRedirect {
  const root = segments[0];

  // Still resolving the initial route — wait for a real segment.
  if (!root) return null;

  const inProtected = PROTECTED_ROOTS.has(root);
  const inAuth = AUTH_ROOTS.has(root);

  if (!isSignedIn && inProtected) {
    return "/(auth)/welcome";
  }

  if (isSignedIn && inAuth) {
    return "/(tabs)/active";
  }

  // index is public: launch redirect stays in app/index.tsx.
  // onboarding stays public.
  return null;
}

/**
 * Whether an API error response should wipe the local session.
 *
 * Login 401 is a wrong-password signal, not an expired session — never
 * invalidate on `/auth/login`. Any other 401 (including expired/invalid
 * bearer) clears the session so the gate sends the rider to welcome.
 */
export function shouldInvalidateSessionOnStatus(
  status: number,
  path: string,
): boolean {
  if (status !== 401) return false;
  // Normalise path so callers can pass full URLs or bare paths.
  const bare = path.split("?")[0] ?? path;
  if (bare === "/auth/login" || bare.endsWith("/auth/login")) return false;
  return true;
}
