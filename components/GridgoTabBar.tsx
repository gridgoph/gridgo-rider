import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Bell, House, Inbox, Navigation, User, type LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ACTION_TAB, TABS, type TabName } from "@/constants/tabs";
import { useThemeColors } from "@/hooks/useTheme";
import { useNotifications } from "@/store/notifications";

/**
 * One Lucide glyph per tab, all outline, all the same optical weight, so the
 * row reads as one set.
 */
const ICONS: Record<TabName, LucideIcon> = {
  home: House,
  offers: Inbox,
  active: Navigation,
  notifications: Bell,
  account: User,
};

/**
 * The GRIDGO rider tab bar.
 *
 * Four labelled destinations and one raised centre disc for Active — the
 * trip currently in hand. The disc is a deliberate product choice (see
 * ACTION_TAB in constants/tabs.ts): Active is the primary working surface,
 * so it earns the bar's single yellow. It is not a "start new" control.
 *
 * The labelled columns are a fixed 52px: an 8px foot, a 16px label box, a 4px
 * gap and a 24px glyph, bottom-aligned so all four share a baseline. The
 * action is a 56px disc with no visible caption — screen readers still hear
 * "Active" via accessibilityLabel.
 *
 * The open tab is said twice over, in colour and in weight: its glyph goes
 * from muted to full-strength ink and its label from muted regular to medium.
 * The row therefore still reads correctly in grayscale.
 */
export function GridgoTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="relative" style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
      {/*
        Drawn before the row, so the action disc paints over the top border and
        the hairline breaks around it with no cut-out to maintain.
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

  // 84 tall against the destinations' 56, which is what lifts the disc out of
  // the row. Its foot lands just above the labels' cap line, so the four
  // destinations and the action still read as one row rather than two.
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
      className="h-13 flex-1 items-center justify-end gap-1 pb-2"
    >
      {({ pressed }) => (
        <>
          {/*
            One glyph, one size, one stroke weight, in both states. Only the
            colour moves — nothing is filled, swapped or rescaled when a tab
            opens, so the row never shifts under your thumb.
          */}
          <View className={pressed ? "opacity-60" : undefined}>
            <View>
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
