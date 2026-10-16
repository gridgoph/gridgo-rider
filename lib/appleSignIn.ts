/**
 * Read the end of a Sign in with Apple attempt (iPhone only).
 *
 * `useSignInWithApple().startAppleAuthenticationFlow()` from `@clerk/expo/apple`
 * runs Apple's own sheet, exchanges Apple's identity token with Clerk, and
 * turns a sign-up of an existing Apple account into a sign-in. What reaches
 * the screen is one of three things:
 *
 * - a created session, which the screen activates. The session bridge
 *   (`hooks/useClerkSessionBridge.ts`) then adopts it against the rider
 *   projection exactly as it adopts a Google sign-in, so an Apple ID with no
 *   rider account is answered the same way a Google one is;
 * - a sign-up Clerk will not finish without more details, which is said;
 * - nothing at all, which is the person closing Apple's sheet. Clerk swallows
 *   `ERR_REQUEST_CANCELED` and answers with no session; it is never an error.
 */

export type AppleFlowResult = {
  createdSessionId: string | null;
  signUp?: { status?: string | null; missingFields?: readonly string[] | null } | null;
};

export type AppleSignInOutcome =
  | { status: "activated"; sessionId: string }
  | { status: "incomplete"; message: string }
  | { status: "cancelled" };

export const APPLE_SIGN_UP_INCOMPLETE =
  "Apple did not share everything GRIDGO needs to open your account. Try again, or sign up with your email.";

export function appleSignInOutcome(result: AppleFlowResult): AppleSignInOutcome {
  if (result.createdSessionId) return { status: "activated", sessionId: result.createdSessionId };
  if (result.signUp?.status === "missing_requirements") {
    return { status: "incomplete", message: APPLE_SIGN_UP_INCOMPLETE };
  }
  return { status: "cancelled" };
}

/** Apple's own code for a person who closed the sheet. */
export function isAppleCancel(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ERR_REQUEST_CANCELED"
  );
}
