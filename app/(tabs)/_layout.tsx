import { Tabs } from "expo-router";
import { useEffect } from "react";

import { GridgoTabBar } from "@/components/GridgoTabBar";
import { TABS } from "@/constants/tabs";
import { useThemeColors } from "@/hooks/useTheme";
import { useNotifications } from "@/store/notifications";

/**
 * Rider tab shell.
 *
 * The bar is drawn from the tokens on every platform — see `GridgoTabBar`.
 * The raised centre disc is Active (see ACTION_TAB): the trip currently in
 * hand. Headers are off; each tab draws its own top chrome.
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
