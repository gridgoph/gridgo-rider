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
  | "/(auth)/login"
  | "/(tabs)/active"
  | null;

/**
 * Route groups / top-level segments that require a signed-in rider.
 * Anything else is treated as public (login, onboarding, index).
 */
export const PROTECTED_ROOTS = new Set(["(tabs)", "design-system"]);

/** Auth-only surfaces — a signed-in rider should not linger here. */
export const AUTH_ROOTS = new Set(["(auth)"]);

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
    return "/(auth)/login";
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
 * bearer) clears the session so the gate sends the rider to login.
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
