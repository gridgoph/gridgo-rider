import { useRootNavigationState, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";

import { canGateNavigate, resolveAuthRedirect } from "@/lib/authGate";
import { useSession } from "@/store/session";

/**
 * Continuous session → route binding.
 *
 * Re-runs whenever the rider signs in/out or navigates. Uses replace so
 * sign-out does not leave (tabs) on the back stack (back cannot re-enter).
 *
 * Two guards stand in front of the redirect, and both are load-bearing:
 * the root navigator has to exist before `replace` is legal, and the stored
 * session has to have been read back before "no user" means "signed out".
 * Without them a cold start on a protected route threw
 * "Attempted to navigate before mounting the Root Layout component".
 */
export function useAuthGate(): void {
  const user = useSession((s) => s.user);
  const hydrated = useSession((s) => s.hydrated);
  const segments = useSegments();
  const router = useRouter();
  const rootState = useRootNavigationState();
  const rootNavigatorKey = rootState?.key;

  useEffect(() => {
    if (!canGateNavigate({ rootNavigatorKey, sessionHydrated: hydrated })) return;

    const target = resolveAuthRedirect(Boolean(user), segments);
    if (target) {
      router.replace(target);
    }
  }, [user, hydrated, rootNavigatorKey, segments, router]);
}
