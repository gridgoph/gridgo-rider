import { Tabs } from "expo-router";
import { useEffect } from "react";

import { GridgoTabBar } from "@/components/GridgoTabBar";
import { TABS } from "@/constants/tabs";
import { useThemeColors } from "@/hooks/useTheme";
import { useNotifications } from "@/store/notifications";

/**
 * Rider tab shell.
 *
 * Tabs: Offers · Active (raised disc) · Alerts · Account.
 * Home was removed — it duplicated Active and Offers. Launch lands on Active
 * so a mid-delivery rider reaches the job in zero taps.
 *
 * The bar is drawn from tokens on every platform — see `GridgoTabBar`.
 */
export default function TabsLayout() {
  const colors = useThemeColors();
  const refreshUnread = useNotifications((s) => s.refreshUnread);

  useEffect(() => {
    void refreshUnread();
  }, [refreshUnread]);

  return (
    <Tabs
      tabBar={(props) => <GridgoTabBar {...props} />}
      initialRouteName="active"
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.canvas },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}
