import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Bell, Inbox, Navigation, User, type LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ACTION_TAB, TABS, type TabName } from "@/constants/tabs";
import { useThemeColors } from "@/hooks/useTheme";
import { useNotifications } from "@/store/notifications";

/**
 * One Lucide glyph per tab, all outline, all the same optical weight.
 */
const ICONS: Record<TabName, LucideIcon> = {
  offers: Inbox,
  active: Navigation,
  notifications: Bell,
  account: User,
};

/**
 * Tab bar geometry (Material Design 3 icon+label bar = 80dp content column).
 *
 * System inset (gesture bar / three-button nav) and design padding STACK:
 *   paddingBottom = insets.bottom + TAB_DESIGN_PADDING
 * Math.max was wrong — it discarded the design pad whenever the inset
 * exceeded 8px (every modern Android phone).
 *
 * The painted surface is an absolute overlay starting 16dp (top-4) below the
 * container top so the visible bar is 64 + inset + 8. The top 16dp stays
 * transparent; the raised Active disc paints over that strip and breaks the
 * hairline — same structure as gridgo-client.
 */
export const TAB_CONTENT_HEIGHT = 80;
/** Design padding under the icon+label row — always stacked with the system inset. */
export const TAB_DESIGN_PADDING = 8;
/**
 * How far the painted surface (bg + top hairline) sits below the container top.
 * Matches NativeWind `top-4` (16dp). Visible bar height = content − this + inset + pad.
 */
export const TAB_SURFACE_TOP_OFFSET = 16;

/**
 * The GRIDGO rider tab bar.
 *
 * Three labelled destinations and one raised centre disc for Active — the
 * trip currently in hand. The disc is a deliberate product choice (see
 * ACTION_TAB): Active is the primary working surface, so it earns the bar's
 * single yellow.
 */
export function GridgoTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  // Stack system keep-out with design padding — never Math.max.
  const bottomPad = insets.bottom + TAB_DESIGN_PADDING;

  return (
    <View className="relative" style={{ paddingBottom: bottomPad }}>
      {/* Painted surface under the row: starts 16dp down so the disc can overhang. */}
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

  // Raised disc for Active — 56px circle; surface is drawn first so the disc
  // paints over the hairline and stands proud of the painted bar.
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
      className="min-h-20 flex-1 items-center justify-end gap-1 pb-2 pt-2"
    >
      {({ pressed }) => (
        <>
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
