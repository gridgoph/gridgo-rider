import { Redirect } from "expo-router";

import { SessionWait } from "@/components/SessionWait";
import { useRiderAuthHold } from "@/hooks/useRiderAuthHold";
import { useSession } from "@/store/session";

/**
 * Launch lands on Active — the job in hand.
 *
 * Nothing is decided until the stored session has been read back: rendering a
 * redirect first would send a signed-in rider to welcome for one frame, and the
 * gate would then bounce them back. The splash stays up over this.
 * Google / restore stays on the wait — never Welcome before Active.
 */
export default function Index() {
  const user = useSession((s) => s.user);
  const hydrated = useSession((s) => s.hydrated);
  const hold = useRiderAuthHold();

  if (!hydrated) return null;
  if (hold) return <SessionWait tone={hold} role="rider" />;
  if (user) return <Redirect href="/(tabs)/active" />;
  return <Redirect href="/(auth)/welcome" />;
}
