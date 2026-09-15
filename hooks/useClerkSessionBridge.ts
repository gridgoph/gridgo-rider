import { useAuth, useClerk } from "@clerk/expo";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import * as api from "@/lib/api";
import { CLERK_JOIN_TIMEOUT_MS } from "@/lib/authGate";
import {
  bindClerkSignOut,
  isClerkAdoptionBlocked,
  releaseClerkAdoptionBlock,
  useSession,
} from "@/store/session";

/**
 * Joins Clerk identity to the existing domain session without changing feature
 * call sites. Clerk owns the bearer; `/auth/me` remains the API's projection
 * and authorization is still enforced by the server on every request.
 *
 * Adopt as soon as Clerk reports signed-in. Waiting on `useUser()` left a
 * restored session on Signing you in forever when metadata never arrived,
 * because `/auth/me` never ran and the join bound only covered signed-out.
 */
export function useClerkSessionBridge(): boolean {
  const { isLoaded, isSignedIn, getToken, sessionClaims, sessionId: clerkSessionId } = useAuth();
  const { signOut } = useClerk();
  const adoptClerkSession = useSession((state) => state.adoptClerkSession);
  const beginClerkSession = useSession((state) => state.beginClerkSession);
  const clearSession = useSession((state) => state.clearSession);
  const authSource = useSession((state) => state.authSource);
  const needsApplication = useSession((state) => state.needsApplication);
  const showErrorOnLogin = useSession((state) => state.showErrorOnLogin);
  const sessionId = typeof sessionClaims?.sid === "string" ? sessionClaims.sid : "active";
  const identityKey = isLoaded && isSignedIn ? sessionId : null;
  const [settledIdentity, setSettledIdentity] = useState<string | null>(null);
  if (needsApplication && identityKey && settledIdentity !== identityKey) {
    setSettledIdentity(identityKey);
  }
  const currentIdentity = useRef(identityKey);
  useLayoutEffect(() => { currentIdentity.current = identityKey; }, [identityKey]);
  const handledSession = useRef<string | null>(null);
  // Applying can claim this identity before the bridge starts adoption. Keep
  // that claim even when needsApplication clears, so the bridge cannot probe
  // again and replace the application's token provider mid-submit.
  const settledUnassigned = useRef<string | null>(null);

  const claimsSessionId = (sessionClaims as { sid?: unknown } | null | undefined)?.sid;
  const signOutSessionId = clerkSessionId ?? (typeof claimsSessionId === "string" ? claimsSessionId : null);
  useEffect(
    () => bindClerkSignOut(signOutSessionId ? () => signOut({ sessionId: signOutSessionId }) : null),
    [signOut, signOutSessionId],
  );

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      handledSession.current = null;
      settledUnassigned.current = null;
      api.setTokenProvider(null);
      releaseClerkAdoptionBlock();
      // Unassigned apply leaves `authSource` null, so a later Clerk sign-out
      // must still drop the apply hold — otherwise Sign in cannot leave Sign up.
      if (authSource === "clerk" || needsApplication) clearSession();
      // A Google return can relaunch before Clerk reports signed-in. Keep the
      // wait briefly; if nobody arrives, drop it so a real signed-out rider
      // can see Welcome.
      const joining = useSession.getState().sessionWait === "in";
      if (joining) {
        const timer = setTimeout(() => {
          if (!useSession.getState().user && !useSession.getState().loading) {
            useSession.getState().clearSessionWait();
          }
        }, CLERK_JOIN_TIMEOUT_MS);
        return () => clearTimeout(timer);
      }
      return;
    }

    // Applying already owns this Clerk session. Restarting adoption here
    // clears the token provider mid-submit and leaves Apply stuck on sending.
    if (needsApplication) {
      settledUnassigned.current = sessionId;
      return;
    }

    if (isClerkAdoptionBlocked()) {
      return;
    }

    if (handledSession.current === sessionId) {
      return;
    }

    if (settledUnassigned.current === sessionId) {
      return;
    }

    // A restored Clerk session owns the door immediately. Clear an older demo
    // bearer and probe `/auth/me` with `getToken()` — do not wait for user
    // metadata. Membership is the API projection, not Clerk publicMetadata.
    beginClerkSession();
    handledSession.current = sessionId;
    const removeProvider = api.setTokenProvider(() => getToken());
    let cancelled = false;

    void adoptClerkSession().then((adoption) => {
      // Adoption can update authSource and clean up this effect before its
      // promise callback runs. Record completion for that identity regardless;
      // an older identity cannot make the current session ready.
      if (currentIdentity.current === sessionId) setSettledIdentity(sessionId);
      if (cancelled) return;
      /*
        Only a rejection ends the session.

        "unassigned" means Clerk authenticated someone GRIDGO holds no rider
        record for — every rider between verifying their email and filing their
        application. Signing them out here destroyed the session their own
        application had to be filed against, and the apply screen was replaced
        by a sign-in screen blaming their password. The bearer stays installed
        so that application can authenticate.
      */
      if (adoption === "unassigned") {
        settledUnassigned.current = sessionId;
      } else if (adoption === "rejected") {
        removeProvider();
        void signOut().catch(() => {});
      }
    });

    return () => {
      cancelled = true;
      // Keep the provider installed while this Clerk session remains active.
      // A later signed-out effect clears it; removing it on an ordinary
      // component re-render would create unauthenticated API calls.
    };
  }, [
    adoptClerkSession,
    authSource,
    beginClerkSession,
    clearSession,
    getToken,
    isLoaded,
    isSignedIn,
    needsApplication,
    sessionClaims,
    sessionId,
    signOut,
  ]);

  return Boolean(isLoaded && (
    !isSignedIn || needsApplication || isClerkAdoptionBlocked() || showErrorOnLogin ||
    settledIdentity === identityKey
  ));
}
