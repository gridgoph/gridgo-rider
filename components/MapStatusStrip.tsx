import { Circle, CircleDot, Clock } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { AlertsButton } from "@/components/AlertsButton";
import { ChatButton } from "@/components/ChatButton";
import { EarningAmount } from "@/components/EarningAmount";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  /** "review" until Operations approves the account. */
  status: "online" | "offline" | "review";
  /** The rider's own earnings today, or null until read. */
  todayMinor: number | null;
  online: boolean;
  /**
   * Flip online from the top of the map. The only switch while a job hides
   * the bottom panel's, so going offline mid-job stays one tap away (and
   * asks first). Absent before approval.
   */
  onToggleOnline?: () => void;
};

const STATUS_LABEL: Record<Props["status"], string> = {
  online: "Online",
  offline: "Offline",
  review: "In review",
};

/**
 * The top of the map: where the rider stands, what today has paid, and the
 * two ways out to people (support chat and alerts).
 *
 * Floating pills over the map rather than a bar across it, so the city stays
 * visible behind them; each is a solid surface with a border, readable in
 * sunlight over any tile.
 */
export function MapStatusStrip({ status, todayMinor, online, onToggleOnline }: Props) {
  const colors = useThemeColors();
  const Icon = status === "online" ? CircleDot : status === "review" ? Clock : Circle;
  const tint = status === "online" ? colors.success : colors.textMuted;

  return (
    <View className="flex-row items-center gap-2">
      <Pressable
        onPress={onToggleOnline}
        disabled={!onToggleOnline}
        accessibilityRole={onToggleOnline ? "switch" : "text"}
        accessibilityLabel={onToggleOnline ? "Online" : `Status: ${STATUS_LABEL[status]}`}
        accessibilityState={onToggleOnline ? { checked: online } : undefined}
        // react-native-web reads only aria-* for state (see OnlineSwitch).
        aria-checked={onToggleOnline ? online : undefined}
        className="h-11 flex-row items-center gap-2 rounded-pill border border-outline bg-surface px-3"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        testID="map-status"
      >
        <Icon size={18} color={tint} strokeWidth={2.5} />
        <Text className="text-body font-bold text-text-primary">{STATUS_LABEL[status]}</Text>
      </Pressable>

      {todayMinor != null ? (
        <View
          className="h-11 min-w-0 shrink flex-row items-center gap-2 rounded-pill border border-outline bg-surface px-3"
          accessibilityRole="text"
          accessibilityLabel={`Earned today: ${(todayMinor / 100).toFixed(2)} pesos`}
          testID="map-today"
        >
          <Text className="text-caption text-text-secondary">Today</Text>
          <EarningAmount minor={todayMinor} size="body" />
        </View>
      ) : null}

      <View className="flex-1" />
      <ChatButton />
      <AlertsButton />
    </View>
  );
}
