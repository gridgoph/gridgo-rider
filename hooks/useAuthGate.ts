import { useRootNavigationState, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";

import { useRiderAuthHold } from "@/hooks/useRiderAuthHold";
import { accountHold } from "@/lib/accountHold";
import { canGateNavigate, LEGAL_REVIEW_ROUTE, resolveAuthRedirect } from "@/lib/authGate";
import { legalGateFor, useLegalConsent } from "@/store/legalConsent";
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
  const showErrorOnLogin = useSession((s) => s.showErrorOnLogin);
  const needsApplication = useSession((s) => s.needsApplication);
  const sessionWait = useSession((s) => s.sessionWait);
  // A held account never reads its terms (`useLegalGate`): the hold replaces
  // the whole stack, so there is nothing for the legal gate to close.
  const legal = useLegalConsent((s) => (accountHold(user) ? "clear" : legalGateFor(s, user?.id)));
  const hold = useRiderAuthHold();
  const segments = useSegments();
  const router = useRouter();
  const rootState = useRootNavigationState();
  const rootNavigatorKey = rootState?.key;

  useEffect(() => {
    if (!canGateNavigate({ rootNavigatorKey, sessionHydrated: hydrated })) return;

    const target = resolveAuthRedirect(
      Boolean(user),
      segments,
      showErrorOnLogin,
      needsApplication,
      sessionWait ?? hold,
      legal,
    );
    if (target === LEGAL_REVIEW_ROUTE) {
      // Close what is stacked above, so Back cannot walk around the agreement.
      if (router.canDismiss()) router.dismissAll();
      router.replace(target);
    } else if (target) {
      router.replace(target);
    }
  }, [
    user,
    hydrated,
    showErrorOnLogin,
    needsApplication,
    sessionWait,
    hold,
    legal,
    rootNavigatorKey,
    segments,
    router,
  ]);
}
