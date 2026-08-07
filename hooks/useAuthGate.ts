import { useRouter, useSegments } from "expo-router";
import { useEffect } from "react";

import { resolveAuthRedirect } from "@/lib/authGate";
import { useSession } from "@/store/session";

/**
 * Continuous session → route binding.
 *
 * Re-runs whenever the rider signs in/out or navigates. Uses replace so
 * sign-out does not leave (tabs) on the back stack (back cannot re-enter).
 */
export function useAuthGate(): void {
  const user = useSession((s) => s.user);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const target = resolveAuthRedirect(Boolean(user), segments);
    if (target) {
      router.replace(target);
    }
  }, [user, segments, router]);
}
