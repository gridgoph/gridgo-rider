import { Tabs } from "expo-router";
import { useEffect } from "react";

import { GridgoTabBar } from "@/components/GridgoTabBar";
import { SessionWait } from "@/components/SessionWait";
import { TABS } from "@/constants/tabs";
import { useRiderAuthHold } from "@/hooks/useRiderAuthHold";
import { useThemeColors } from "@/hooks/useTheme";
import { useNotifications } from "@/store/notifications";
import { useSession } from "@/store/session";
import { useTripProof } from "@/store/tripProof";

/**
 * Rider tab shell. Destination and action semantics belong to `constants/tabs.ts`.
 * Root-owned account/trip reconciliation lives in `hooks/useAlertStream.ts`.
 * The bar is drawn from tokens on every platform — see `GridgoTabBar`.
 */
export default function TabsLayout() {
  const colors = useThemeColors();
  const userId = useSession((s) => s.user?.id ?? null);
  const hold = useRiderAuthHold();
  const hydrateProof = useTripProof((s) => s.hydrate);
  const hydrateAlerts = useNotifications((s) => s.hydrate);

  useEffect(() => {
    void hydrateProof();
    void hydrateAlerts();
  }, [hydrateProof, hydrateAlerts]);


  if (!userId) {
    return <SessionWait tone={hold ?? "out"} role="rider" />;
  }

  return (
    <Tabs
      tabBar={(props) => <GridgoTabBar {...props} />}
      initialRouteName="active"
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.canvas },
        /*
          Switching destination is not a journey. The chrome is fixed, the tab
          bar does not move, and the content is simply the other tab's — a
          slide or a fade would animate a change of place that never happened.
          The library already defaults to this; it is written down so it cannot
          drift, and so nobody adds `shift` for polish later.

          What riders reported as "it scrolls a bit, from the bottom it goes
          up" was never this: it was layout settling — a placeholder shorter
          than the content that replaced it. That is fixed in the skeletons,
          which now hold the height the answer will take.
        */
        animation: "none",
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}
