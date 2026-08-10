import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  icon: LucideIcon;
  label: string;
  /** One line saying what is behind the row. Optional. */
  detail?: string | null;
  /** Short status on the right, before the chevron — a count, a state. */
  value?: string | null;
  onPress: () => void;
  /** Drop the hairline on the last row of a group. */
  last?: boolean;
};

/**
 * A row that opens somewhere else.
 *
 * Label, chevron, and nothing that looks like a button: a destination is not
 * an action, and styling it as one is how a settings list ends up with five
 * things competing with the screen's real CTA.
 */
export function DestinationRow({
  icon: Icon,
  label,
  detail,
  value,
  onPress,
  last = false,
}: Props) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={detail ?? undefined}
      className={
        last
          ? "min-h-14 flex-row items-center gap-3 p-4"
          : "min-h-14 flex-row items-center gap-3 border-b border-outline-subtle p-4"
      }
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
    >
      <Icon size={20} color={colors.textMuted} strokeWidth={2} />
      <View className="min-w-0 flex-1">
        <Text className="text-body-lg text-text-primary">{label}</Text>
        {detail ? (
          <Text className="mt-0.5 text-caption text-text-muted">{detail}</Text>
        ) : null}
      </View>
      {value ? <Text className="text-body text-text-secondary">{value}</Text> : null}
      <ChevronRight size={20} color={colors.textMuted} accessibilityElementsHidden />
    </Pressable>
  );
}
