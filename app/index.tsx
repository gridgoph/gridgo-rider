import { Redirect } from "expo-router";

import { SessionWait } from "@/components/SessionWait";
import { useRiderAuthHold } from "@/hooks/useRiderAuthHold";
import { accountHold } from "@/lib/accountHold";
import { LEGAL_REVIEW_ROUTE } from "@/lib/authGate";
import { legalGateFor, useLegalConsent } from "@/store/legalConsent";
import { useSession } from "@/store/session";

/**
 * Launch lands on Active — the job in hand — unless GRIDGO has terms waiting
 * for this rider, in which case it lands on the agreement screen first.
 *
 * Nothing is decided until the stored session has been read back: rendering a
 * redirect first would send a signed-in rider to welcome for one frame, and the
 * gate would then bounce them back. The splash stays up over this.
 * Google / restore stays on the wait — never Welcome before Active. So does the
 * terms read (`store/legalConsent.ts`), which gives up after a few seconds
 * rather than hold anyone out of their job.
 */
export default function Index() {
  const user = useSession((s) => s.user);
  const hydrated = useSession((s) => s.hydrated);
  const hold = useRiderAuthHold();
  const legal = useLegalConsent((s) => (accountHold(user) ? "clear" : legalGateFor(s, user?.id)));

  if (!hydrated) return null;
  if (hold) return <SessionWait tone={hold} role="rider" />;
  if (user && legal === "unknown") return <SessionWait tone="in" role="rider" />;
  if (user && legal === "blocked") return <Redirect href={LEGAL_REVIEW_ROUTE} />;
  if (user) return <Redirect href="/(tabs)/active" />;
  return <Redirect href="/(auth)/welcome" />;
}
