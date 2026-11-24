import { UsersRound } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { groupHostLabel, groupOrderOf, groupTagLine, groupTagSpoken, groupTagTitle } from "@/lib/groupOrder";

type Props = {
  order: { groupOrder?: unknown };
  /** `compact` is one quiet line for the map's trip panel; `full` adds who to call. */
  variant?: "full" | "compact";
};

/**
 * "Group order, 5 people · Host: Ana" — the one thing a rider must know about
 * a group job: many people paid, one person receives. Monochrome, on the
 * grouping panel, so it informs without competing with the step's yellow.
 * Renders nothing on an ordinary job.
 */
export function GroupOrderTag({ order, variant = "full" }: Props) {
  const colors = useThemeColors();
  const group = groupOrderOf(order);
  if (!group) return null;
  const compact = variant === "compact";
  return (
    <View
      className={
        compact
          ? "flex-row items-center gap-2 self-start rounded-pill bg-surface-variant px-3 py-1.5"
          : "flex-row items-start gap-3 rounded-field bg-surface-variant p-3"
      }
      accessible
      accessibilityRole="text"
      accessibilityLabel={groupTagSpoken(group)}
      testID="group-order-tag"
    >
      <View className={compact ? undefined : "h-9 w-9 items-center justify-center rounded-pill bg-accent"}>
        <UsersRound size={compact ? 16 : 18} color={compact ? colors.textPrimary : colors.accentOn} strokeWidth={2} />
      </View>
      {compact ? (
        <Text className="text-caption font-bold text-text-primary" numberOfLines={1}>
          {groupTagLine(group)}
        </Text>
      ) : (
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-body font-bold text-text-primary">{groupTagTitle(group)}</Text>
          <Text className="text-body text-text-primary">{groupHostLabel(group)}</Text>
          <Text className="text-caption text-text-secondary">
            One person receives everything. Call and message only the host.
          </Text>
        </View>
      )}
    </View>
  );
}
