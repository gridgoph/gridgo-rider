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
 * sitting on Earnings still needs the disc to say "Hand over" the moment the
 * job reaches that step.
 *
 * The bar is drawn from tokens on every platform — see `GridgoTabBar`.
 */
export default function TabsLayout() {
  const colors = useThemeColors();
  const refreshUnread = useNotifications((s) => s.refreshUnread);
  const userId = useSession((s) => s.user?.id ?? null);
  const sessionReady = useSession((s) => s.hydrated);
  const refreshTrip = useActiveTrip((s) => s.refresh);
  const hydrateProof = useTripProof((s) => s.hydrate);
  const hydrateAlerts = useNotifications((s) => s.hydrate);
  const refreshUser = useSession((s) => s.refreshUser);

  /*
    The account is polled with the trip, because accreditation is the one thing
    about a rider that changes while they are sitting in the app doing nothing.
    Without this, an Operations decision — approved, or suspended mid-shift —
    only reached the phone on the next sign-in, so the "awaiting approval"
    screen the rider was staring at could never resolve itself.
  */
  const poll = useCallback(() => {
    void refreshTrip(userId, "refresh");
    void refreshUnread();
    void refreshUser();
  }, [refreshTrip, refreshUnread, refreshUser, userId]);

  useEffect(() => {
    void hydrateProof();
    void hydrateAlerts();
  }, [hydrateProof, hydrateAlerts]);

  useEffect(() => {
    if (!sessionReady || !userId) return;
    void refreshTrip(userId);
    void refreshUnread();
    void refreshUser();
    const handle = setInterval(poll, TRIP_POLL_MS);
    return () => clearInterval(handle);
  }, [poll, refreshTrip, refreshUnread, refreshUser, sessionReady, userId]);

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
      {DESTINATION_TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}
