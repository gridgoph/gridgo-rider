import { useRouter } from "expo-router";
import { useEffect } from "react";

import { SessionWait } from "@/components/SessionWait";
import { useSession } from "@/store/session";

/**
 * Native Google return. Stay here until GRIDGO has adopted the rider —
 * replacing to `/` is what painted Welcome under a successful sign-in.
 */
export default function SsoCallbackScreen() {
  const router = useRouter();
  const user = useSession((state) => state.user);
  const showErrorOnLogin = useSession((state) => state.showErrorOnLogin);
  const needsApplication = useSession((state) => state.needsApplication);

  useEffect(() => {
    useSession.getState().beginSessionWait("in");
  }, []);

  useEffect(() => {
    if (user) {
      router.replace("/(tabs)/active");
      return;
    }
    if (showErrorOnLogin) {
      router.replace("/(auth)/login");
      return;
    }
    if (needsApplication) {
      router.replace("/(auth)/signup");
    }
  }, [needsApplication, router, showErrorOnLogin, user]);

  return <SessionWait tone="in" role="rider" />;
}
