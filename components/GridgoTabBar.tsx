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
 * Tab bar geometry (Material Design 3 icon+label bar = 80dp content).
 *
 * System inset (gesture bar / three-button nav) and design padding STACK:
 *   paddingBottom = insets.bottom + TAB_DESIGN_PADDING
 * Math.max was wrong — it discarded the design pad whenever the inset
 * exceeded 8px (every modern Android phone).
 *
 * Resulting total height below the top hairline:
 *   - gesture nav (insets.bottom ≈ 24–48): 80 + inset + 8
 *   - three-button nav (insets.bottom ≈ 48): 80 + inset + 8
 *   - zero inset (emulator / older): 80 + 0 + 8 = 88
 *
 * The surface and top border span the full inset region so the bar reads as
 * one solid slab to the physical edge of the device.
 */
export const TAB_CONTENT_HEIGHT = 80;
/** Design padding under the icon+label row — always stacked with the system inset. */
export const TAB_DESIGN_PADDING = 8;

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
  const colors = useThemeColors();
  // Stack system keep-out with design padding — never Math.max.
  const bottomPad = insets.bottom + TAB_DESIGN_PADDING;

  return (
    <View
      style={{
        paddingBottom: bottomPad,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.outline,
      }}
    >
      <View
        className="flex-row items-end"
        style={{ height: TAB_CONTENT_HEIGHT }}
      >
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

  // Raised disc for Active — 56px circle, lifted in the 80dp content row.
  if (name === ACTION_TAB) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: focused }}
        className="flex-1 items-center justify-center"
        style={{ height: TAB_CONTENT_HEIGHT }}
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
      className="flex-1 items-center justify-end gap-1"
      style={{ height: TAB_CONTENT_HEIGHT, paddingBottom: 12 }}
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
