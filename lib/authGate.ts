/**
 * Session → route mapping for the rider app.
 *
 * Pure helpers so the routing layer and unit tests share one source of truth.
 * The root layout re-evaluates this whenever the session or segments change —
 * not only at cold launch — so sign-out, expired tokens, and 401s all leave
 * the authenticated area.
 */

import type { LegalGateStatus } from "@/lib/legal";

/** Destinations the gate may emit. Always use replace, never push. */
export type AuthRedirect =
  | "/"
  | "/(auth)/welcome"
  | "/(auth)/login"
  | "/(auth)/signup"
  | "/(tabs)/active"
  | "/legal/review"
  | null;

/** Identity wait to paint instead of Welcome. */
export type RiderAuthHold = "in" | "out" | null;

/** Deadline per domain adoption attempt, also used for a signed-out Google return. */
export const CLERK_JOIN_TIMEOUT_MS = 12_000;

/**
 * Whether the door must stay closed.
 *
 * Google often relaunches the app at `/` with no GRIDGO user yet: Clerk is
 * still loading, or `/auth/me` is in flight. Sending that rider to Welcome is
 * the flash before Active.
 *
 * After Clerk is loaded, signed-in alone does not hold. A restored session
 * with no GRIDGO user used to spin on Signing you in forever when user
 * metadata never arrived and `/auth/me` never ran.
 */
export function riderAuthHold(input: {
  hasUser: boolean;
  sessionWait: "in" | "out" | null;
  loading: boolean;
  clerkLoaded: boolean;
  clerkSignedIn: boolean;
  googleReturn: boolean;
  /** Explicit sign-out: leftover Clerk is not a Google return. */
  signedOut?: boolean;
  /** Wrong-role / refused identity: show the login error, do not keep waiting. */
  hasError?: boolean;
  /** Clerk knows this person; GRIDGO has no rider record — send them to apply. */
  needsApplication?: boolean;
}): RiderAuthHold {
  if (input.sessionWait === "out") return "out";
  if (input.signedOut) return null;
  if (input.hasError) return null;
  if (input.needsApplication) return null;
  if (input.clerkLoaded && input.clerkSignedIn && !input.loading) return null;
  if (input.sessionWait === "in") return "in";
  if (input.hasUser) return null;
  if (input.loading || input.googleReturn) return "in";
  if (!input.clerkLoaded) return "in";
  return null;
}

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
  // A rider's own privacy requests.
  "privacy",
]);

/**
 * Signed in, and open even while terms wait to be agreed (`docs/LEGAL_API.md`):
 * the documents, the rider's privacy requests and account deletion never wait
 * behind the agreement box. The confirmation sheet those screens ask through
 * stays open with them. An update to the app and a call ringing in are not
 * navigation the rider chose, so they are not closed either.
 */
export const LEGAL_OPEN_ROOTS = new Set([
  "legal",
  "privacy",
  "delete-account",
  "confirm",
  "app-update",
  "call",
]);

/** The agreement screen itself: only while terms wait to be agreed. */
export const LEGAL_REVIEW_ROUTE = "/legal/review" as const;

function onLegalReview(segments: readonly string[]): boolean {
  return segments[0] === "legal" && segments[1] === "review";
}

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
 * @param showErrorOnLogin - a stored Clerk failure the login screen must render
 * @param needsApplication - Clerk knows this person; GRIDGO has no rider record
 * @param legal - this rider's terms, from `GET /me/legal/pending`
 */
export function resolveAuthRedirect(
  isSignedIn: boolean,
  segments: readonly string[],
  showErrorOnLogin = false,
  needsApplication = false,
  sessionWait: "in" | "out" | null = null,
  legal: LegalGateStatus = "clear",
): AuthRedirect {
  const root = segments[0];

  // Still resolving the initial route — wait for a real segment.
  if (!root) return null;

  const alreadyOnLogin = root === "(auth)" && segments[1] === "login";
  // A refused identity (wrong app) must reach login, not stay on Signing you in.
  if (!isSignedIn && showErrorOnLogin) {
    return alreadyOnLogin ? null : "/(auth)/login";
  }

  /*
    Signed in with Clerk, unknown to GRIDGO: the only thing this person can do
    is apply, so that is where they go — whether they arrived by signing in with
    an account that never applied, or by verifying a brand-new email.

    A stored Clerk failure already sent them to login above: that message has
    to be visible. This branch is the unassigned-identity case, not an error,
    and it outranks Signing you in so a finished adopt cannot leave them there.
  */
  if (!isSignedIn && needsApplication) {
    const alreadyApplying = root === "(auth)" && segments[1] === "signup";
    return alreadyApplying ? null : "/(auth)/signup";
  }

  // Google join stays put. Sign-out leaves the tabs — Welcome shows the wait.
  if (sessionWait === "in") return null;
  if (sessionWait === "out") {
    const onWelcome = root === "(auth)" && segments[1] === "welcome";
    return onWelcome ? null : "/(auth)/welcome";
  }

  const inProtected = PROTECTED_ROOTS.has(root);
  const inAuth = AUTH_ROOTS.has(root);

  if (!isSignedIn && (inProtected || onLegalReview(segments))) {
    return "/(auth)/welcome";
  }

  if (isSignedIn) {
    /*
      Terms waiting to be agreed close everything but the agreement screen and
      what a rider needs in order to decide — the documents, their own data,
      and the way out. Sign-out is on the agreement screen itself.
    */
    if (legal === "blocked") {
      return onLegalReview(segments) || LEGAL_OPEN_ROOTS.has(root) ? null : LEGAL_REVIEW_ROUTE;
    }
    // Agreed (or nothing was waiting): the agreement screen has done its job.
    if (onLegalReview(segments)) return legal === "clear" ? "/(tabs)/active" : null;
    // Not answered yet: wait on the launch screen rather than paint Active
    // and snatch it away. A deep link elsewhere is left where it landed.
    if (legal === "unknown" && (inAuth || root === "(tabs)")) return "/";
    if (inAuth) return "/(tabs)/active";
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
