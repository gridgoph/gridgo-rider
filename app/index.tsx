import { Redirect } from "expo-router";

import { useSession } from "@/store/session";

/**
 * Launch lands on Active — the job in hand.
 *
 * Nothing is decided until the stored session has been read back: rendering a
 * redirect first would send a signed-in rider to login for one frame, and the
 * gate would then bounce them back. The splash stays up over this.
 */
export default function Index() {
  const user = useSession((s) => s.user);
  const hydrated = useSession((s) => s.hydrated);

  if (!hydrated) return null;
  if (user) return <Redirect href="/(tabs)/active" />;
  return <Redirect href="/(auth)/login" />;
}
