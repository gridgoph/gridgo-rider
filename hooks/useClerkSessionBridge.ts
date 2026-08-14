import { useAuth, useClerk, useUser } from "@clerk/expo";
import { useEffect, useRef, useState } from "react";

import * as api from "@/lib/api";
import { readGridgoRole, resolveGridgoRole, riderAccessError } from "@/lib/clerkAuth";
import { bindClerkSignOut, useSession } from "@/store/session";

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
  const rejectClerkSession = useSession((state) => state.rejectClerkSession);
  const authSource = useSession((state) => state.authSource);
  const [identityReady, setIdentityReady] = useState(false);
  const handledSession = useRef<string | null>(null);

  useEffect(() => bindClerkSignOut(signOut), [signOut]);

  useEffect(() => {
    if (!isLoaded) {
      setIdentityReady(false);
      return;
    }

    if (!isSignedIn) {
      handledSession.current = null;
      api.setTokenProvider(null);
      if (authSource === "clerk") clearSession();
      setIdentityReady(true);
      return;
    }

    const sessionId = typeof sessionClaims?.sid === "string" ? sessionClaims.sid : "active";
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

    const claimsRole = readGridgoRole(
      sessionClaims as Record<string, unknown> | null | undefined,
    );
    const metadataRole = readGridgoRole(
      user?.publicMetadata as Record<string, unknown> | null | undefined,
    );
    const role = resolveGridgoRole(claimsRole, metadataRole);
    const accessError = riderAccessError(role);

    if (accessError) {
      handledSession.current = sessionId;
      rejectClerkSession(accessError);
      void signOut().catch(() => {});
      setIdentityReady(true);
      return;
    }

    if (handledSession.current === sessionId && authSource === "clerk") {
      setIdentityReady(true);
      return;
    }

    beginClerkSession();
    handledSession.current = sessionId;
    setIdentityReady(false);
    const removeProvider = api.setTokenProvider(() => getToken());
    let cancelled = false;

    void adoptClerkSession().then((adopted) => {
      if (cancelled) return;
      if (!adopted) {
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
    rejectClerkSession,
    sessionClaims,
    signOut,
    user,
    userIsLoaded,
    user?.publicMetadata,
  ]);

  return identityReady;
}
