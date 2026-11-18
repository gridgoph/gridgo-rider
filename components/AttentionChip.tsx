import { useRouter, type Href } from "expo-router";
import { ChevronRight, TriangleAlert, Info } from "lucide-react-native";
import { Pressable, Text } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { AttentionSummary } from "@/lib/attention";

/**
 * Every warning on the map, as one small chip. It names the problem, or
 * counts them, and opens the cards on `app/attention.tsx`.
 */
export function AttentionChip({ summary }: { summary: NonNullable<AttentionSummary> }) {
  const router = useRouter();
  const colors = useThemeColors();
  const Icon = summary.tone === "warning" ? TriangleAlert : Info;
  return (
    <Pressable
      onPress={() => router.push("/attention" as Href)}
      accessibilityRole="button"
      accessibilityLabel={summary.spoken}
      className="h-11 flex-row items-center gap-2 self-start rounded-pill border border-outline bg-surface pl-3 pr-2"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      testID="attention-chip"
    >
      <Icon size={18} color={summary.tone === "warning" ? colors.warning : colors.info} strokeWidth={2.25} />
      <Text className="text-body font-bold text-text-primary">{summary.label}</Text>
      <ChevronRight size={18} color={colors.textSecondary} strokeWidth={2} />
    </Pressable>
  );
}
