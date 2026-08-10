import { Tabs } from "expo-router";
import { useCallback, useEffect } from "react";

import { GridgoTabBar } from "@/components/GridgoTabBar";
import { DESTINATION_TABS } from "@/constants/tabs";
import { useThemeColors } from "@/hooks/useTheme";
import { useActiveTrip } from "@/store/activeTrip";
import { useNotifications } from "@/store/notifications";
import { useSession } from "@/store/session";
import { useTripProof } from "@/store/tripProof";

/** How often the shell re-checks the job in hand while the app is open. */
const TRIP_POLL_MS = 30_000;

/**
 * Rider tab shell.
 *
 * Offers · Active · [action] · Earnings · Account. The centre column is an
 * action rather than a fifth screen — see `constants/tabs.ts` for why, and
 * `lib/riderAction.ts` for what it does at each point in a job.
 *
 * The shell owns the trip poll because the disc's verb depends on it: a rider
 * sitting on Earnings still needs the disc to say "Take cash" the moment the
 * job reaches that step.
 *
 * The bar is drawn from tokens on every platform — see `GridgoTabBar`.
 */
export default function TabsLayout() {
  const colors = useThemeColors();
  const refreshUnread = useNotifications((s) => s.refreshUnread);
  const userId = useSession((s) => s.user?.id ?? null);
  const refreshTrip = useActiveTrip((s) => s.refresh);
  const hydrateProof = useTripProof((s) => s.hydrate);

  const poll = useCallback(() => {
    void refreshTrip(userId, "refresh");
    void refreshUnread();
  }, [refreshTrip, refreshUnread, userId]);

  useEffect(() => {
    void hydrateProof();
  }, [hydrateProof]);

  useEffect(() => {
    void refreshTrip(userId);
    void refreshUnread();
    const handle = setInterval(poll, TRIP_POLL_MS);
    return () => clearInterval(handle);
  }, [poll, refreshTrip, refreshUnread, userId]);

  return (
    <Tabs
      tabBar={(props) => <GridgoTabBar {...props} />}
      initialRouteName="active"
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.canvas },
      }}
    >
      {DESTINATION_TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}
