import { useEffect } from "react";
import { AppState } from "react-native";

import { accountHold } from "@/lib/accountHold";
import { useLegalConsent } from "@/store/legalConsent";
import { hydrateLegalNotices } from "@/store/legalNotices";
import { usePrivacyRequests } from "@/store/privacyRequests";
import { useSession } from "@/store/session";

/**
 * Asks GRIDGO whether this rider has terms to agree to, on every sign-in and
 * every return to the app (`docs/LEGAL_API.md`: "Apps call pending on each
 * open/sign-in"). Staff-provisioned riders reach the Rider Agreement this way
 * on their first sign-in, because nothing was agreed when Operations made them.
 *
 * Mounted once at the root, beside the alert stream, because the launch and
 * the auth gate both wait on the answer. A held account is left alone:
 * `SessionShell` already replaces the app with the hold.
 */
export function useLegalGate(): void {
  const userId = useSession((state) => state.user?.id ?? null);
  const held = useSession((state) => accountHold(state.user) != null);

  useEffect(() => {
    void hydrateLegalNotices();
  }, []);

  useEffect(() => {
    // Another rider's requests never show on this one's Your data.
    usePrivacyRequests.getState().reset();
    if (!userId) {
      useLegalConsent.getState().reset();
      return;
    }
    if (held) return;
    void useLegalConsent.getState().load(userId);
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void useLegalConsent.getState().load(userId);
    });
    return () => subscription.remove();
  }, [userId, held]);
}
