import { useAuth } from "@clerk/expo";
import * as Linking from "expo-linking";

import { riderAuthHold, type RiderAuthHold } from "@/lib/authGate";
import { isClerkAdoptionBlocked, useSession } from "@/store/session";

/**
 * Whether this frame must show Signing you in / out instead of Welcome.
 *
 * Google often relaunches at `/` before Clerk has the session, and a leftover
 * `sso-callback` URL is the only proof the browser is still coming back.
 */
export function useRiderAuthHold(): RiderAuthHold {
  const user = useSession((state) => state.user);
  const sessionWait = useSession((state) => state.sessionWait);
  const loading = useSession((state) => state.loading);
  const showErrorOnLogin = useSession((state) => state.showErrorOnLogin);
  const error = useSession((state) => state.error);
  const { isLoaded, isSignedIn } = useAuth();
  const url = Linking.useURL();
  return riderAuthHold({
    hasUser: Boolean(user),
    sessionWait,
    loading,
    clerkLoaded: isLoaded,
    clerkSignedIn: Boolean(isSignedIn),
    googleReturn: Boolean(url && /sso-callback/i.test(url)),
    signedOut: isClerkAdoptionBlocked(),
    hasError: Boolean(showErrorOnLogin || error),
  });
}
