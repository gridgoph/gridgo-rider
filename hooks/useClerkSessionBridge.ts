import { useAuth, useClerk, useUser } from "@clerk/expo";
import { useEffect, useRef, useState } from "react";

import * as api from "@/lib/api";
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
 */
export function useClerkSessionBridge(): boolean {
  const { isLoaded, isSignedIn, getToken, sessionClaims } = useAuth();
  const { isLoaded: userIsLoaded, user } = useUser();
  const { signOut } = useClerk();
  const adoptClerkSession = useSession((state) => state.adoptClerkSession);
  const beginClerkSession = useSession((state) => state.beginClerkSession);
  const clearSession = useSession((state) => state.clearSession);
  const authSource = useSession((state) => state.authSource);
  const needsApplication = useSession((state) => state.needsApplication);
  const [identityReady, setIdentityReady] = useState(false);
  const handledSession = useRef<string | null>(null);
  // A session GRIDGO has no rider record for stays signed in, so `authSource`
  // never becomes "clerk" and the short-circuit below would miss. Without this
  // the effect would ask `/auth/me` again on every render while someone fills
  // in the application form.
  const settledUnassigned = useRef<string | null>(null);

  useEffect(() => bindClerkSignOut(signOut), [signOut]);

  useEffect(() => {
    if (!isLoaded) {
      setIdentityReady(false);
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
      setIdentityReady(true);
      // A Google return can relaunch before Clerk reports signed-in. Keep the
      // wait briefly; if nobody arrives, drop it so a real signed-out rider
      // can see Welcome.
      const joining = useSession.getState().sessionWait === "in";
      if (joining) {
        const timer = setTimeout(() => {
          if (!useSession.getState().user && !useSession.getState().loading) {
            useSession.getState().clearSessionWait();
          }
        }, 12_000);
        return () => clearTimeout(timer);
      }
      return;
    }

    const sessionId = typeof sessionClaims?.sid === "string" ? sessionClaims.sid : "active";
    // Applying already owns this Clerk session. Restarting adoption here
    // clears the token provider mid-submit and leaves Apply stuck on sending.
    if (needsApplication) {
      settledUnassigned.current = sessionId;
      setIdentityReady(true);
      return;
    }

    if (isClerkAdoptionBlocked()) {
      setIdentityReady(true);
      return;
    }

    // A restored Clerk session owns the door immediately. Clear an older demo
    // bearer before waiting for user metadata, so a slow metadata fetch cannot
    // expose the previous session when the bounded launch deadline expires.
    if (!userIsLoaded || !user) {
      if (handledSession.current !== sessionId || authSource !== "clerk") {
        beginClerkSession();
      }
      setIdentityReady(false);
      return;
    }

    // Clerk metadata names a primary role. Only the role-scoped API projection
    // can establish this app's membership for a person with several roles.
    if (handledSession.current === sessionId && authSource === "clerk") {
      setIdentityReady(true);
      return;
    }

    if (settledUnassigned.current === sessionId) {
      setIdentityReady(true);
      return;
    }

    beginClerkSession();
    handledSession.current = sessionId;
    setIdentityReady(false);
    const removeProvider = api.setTokenProvider(() => getToken());
    let cancelled = false;

    void adoptClerkSession().then((adoption) => {
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
      setIdentityReady(true);
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
    signOut,
    user,
    userIsLoaded,
    user?.publicMetadata,
  ]);

  return identityReady;
}
