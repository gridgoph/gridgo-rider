import { useRouter } from "expo-router";
import { Bell } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { useNotifications } from "@/store/notifications";

/**
 * The way into Alerts, and the only place the unread count is shown.
 *
 * Alerts stopped being a tab because its content restates the offer list and
 * the trip timeline, but the count still has to be visible without opening
 * anything — so it rides on the two screens a rider sits on, Offers and Active.
 *
 * The badge is a count, not a dot: "3 waiting" is worth stopping for and "1"
 * usually is not, and the number is the difference.
 */
export function AlertsButton() {
  const router = useRouter();
  const colors = useThemeColors();
  const unread = useNotifications((s) => s.unread);
  const badge = unread > 9 ? "9+" : String(unread);

  return (
    <Pressable
      onPress={() => router.push("/alerts")}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Alerts, ${unread} unread` : "Alerts"}
      testID="alerts-button"
      className="h-11 w-11 items-center justify-center rounded-pill border border-outline bg-surface"
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
    >
      <View>
        <Bell size={20} color={colors.textPrimary} strokeWidth={2} />
        {unread > 0 ? (
          <View className="absolute -right-2.5 -top-1.5 min-h-4 min-w-4 items-center justify-center rounded-pill bg-error px-1">
            <Text
              className="text-caption"
              style={{
                includeFontPadding: false,
                fontSize: 10,
                lineHeight: 12,
                color: colors.surface,
              }}
            >
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
