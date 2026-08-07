import { Redirect } from "expo-router";
import { useSession } from "@/store/session";

/**
 * Launch lands on Active — the job in hand.
 * Zero taps to the current delivery when a trip is live; empty state
 * points the rider at Offers when idle.
 */
export default function Index() {
  const { user } = useSession();
  if (user) return <Redirect href="/(tabs)/active" />;
  return <Redirect href="/(auth)/login" />;
}
