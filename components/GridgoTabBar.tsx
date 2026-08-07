import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Bell, Inbox, Navigation, User, type LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ACTION_TAB, TABS, type TabName } from "@/constants/tabs";
import { useThemeColors } from "@/hooks/useTheme";
import { useNotifications } from "@/store/notifications";

/**
 * Design breathing room beneath the tab content, inside the bar surface.
 * Stacked on top of `insets.bottom` — never maxed with it. The inset is a
 * system keep-out zone; this is deliberate padding below the labels.
 *
 * Canonical (client): paddingBottom = insets.bottom + 8.
 */
export const TAB_BAR_DESIGN_BOTTOM_PAD = 8;

/**
 * Compose the bar's bottom padding: system inset + design pad.
 * Pure so tests can lock the add (not max) composition without a full render tree.
 */
export function tabBarPaddingBottom(insetBottom: number): number {
  return insetBottom + TAB_BAR_DESIGN_BOTTOM_PAD;
}

/**
 * One Lucide glyph per tab, all outline, all the same optical weight, so the
 * row reads as one set.
 */
const ICONS: Record<TabName, LucideIcon> = {
  offers: Inbox,
  active: Navigation,
  notifications: Bell,
  account: User,
};

/**
 * The GRIDGO rider tab bar — geometry locked to the client canonical numbers.
 *
 * Material Design 3 sizes an icon-plus-label bottom navigation at 80dp. Each
 * labelled column is `min-h-20` (80) with:
 *   pt-2 (8) + icon (24) + gap-1 (4) + label box (16) + pb-2 (8) = 60 natural
 * The min height lifts that to 80; with `justify-end` the extra 20 sits above
 * the glyph. Label sits 8dp off the bottom edge of the content box (pb-2).
 *
 * Raised action column: h-20, disc h-14 w-14, icon size 26.
 *
 * Bottom padding: insets.bottom + 8 (never Math.max). Surface and top border
 * are absolute to the outer edges so they fill the inset region to the
 * physical edge.
 *
 * Yellow is spent only on the Active disc (ACTION_TAB).
 */
export function GridgoTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      testID="gridgo-tab-bar"
      className="relative"
      style={{ paddingBottom: tabBarPaddingBottom(insets.bottom) }}
    >
      {/*
        Drawn before the row, so the action disc paints over the top border and
        the hairline breaks around it with no cut-out to maintain. Spans the
        full outer height including the bottom inset region.
      */}
      <View className="absolute inset-x-0 bottom-0 top-4 border-t border-outline bg-surface" />

      <View className="flex-row items-end">
        {state.routes.map((route, index) => {
          const tab = TABS.find((entry) => entry.name === route.name);
          if (!tab) return null;

          const focused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TabItem
              key={route.key}
              name={tab.name}
              label={tab.label}
              focused={focused}
              onPress={onPress}
            />
          );
        })}
      </View>
    </View>
  );
}

type TabItemProps = {
  name: TabName;
  label: string;
  focused: boolean;
  onPress: () => void;
};

function TabItem({ name, label, focused, onPress }: TabItemProps) {
  const colors = useThemeColors();
  const Icon = ICONS[name];
  const unread = useNotifications((s) => s.unread);
  const alertBadge =
    name === "notifications" && unread > 0
      ? unread > 9
        ? "9+"
        : String(unread)
      : null;

  // Raised action: h-20 column, h-14 w-14 disc, icon 26 (client canonical).
  if (name === ACTION_TAB) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: focused }}
        className="h-20 flex-1 items-center"
      >
        {({ pressed }) => (
          <View className="h-14 w-14 items-center justify-center rounded-pill bg-action-yellow">
            <Icon size={26} color={colors.actionYellowOn} strokeWidth={2.5} />
            {pressed ? <View className="gg-pressed absolute inset-0 rounded-pill" /> : null}
          </View>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={alertBadge ? `${label}, ${alertBadge} unread` : label}
      accessibilityState={{ selected: focused }}
      // min-h-20 = MD3 80dp. pt-2 + icon 24 + gap-1 + label 16 + pb-2 = 60 natural.
      className="min-h-20 flex-1 items-center justify-end gap-1 pb-2 pt-2"
    >
      {({ pressed }) => (
        <>
          <View className={pressed ? "opacity-60" : undefined}>
            <View className="relative">
              <Icon
                size={24}
                strokeWidth={2}
                color={focused ? colors.textPrimary : colors.textMuted}
              />
              {alertBadge ? (
                <View className="absolute -right-2 -top-1 min-h-4 min-w-4 items-center justify-center rounded-pill bg-accent px-1">
                  <Text className="text-nav text-accent-on" style={{ includeFontPadding: false }}>
                    {alertBadge}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
            style={{ includeFontPadding: false, textAlignVertical: "center" }}
            className={
              focused ? "h-4 text-nav font-medium text-text-primary" : "h-4 text-nav text-text-muted"
            }
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
