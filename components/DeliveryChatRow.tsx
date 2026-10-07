import { ChevronRight, MessageCircle } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { deliveryChatEntry, type DeliveryChatSummary } from "@/lib/deliveryChat";

/**
 * The way into the conversation with the client: on the trip while the job is
 * this rider's, and on the trip or past job for a day after delivery, saying
 * when the messages go. Never yellow — the trip's one yellow is its next step.
 */
export function DeliveryChatRow({
  chat,
  onPress,
}: {
  chat: DeliveryChatSummary;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const entry = deliveryChatEntry(chat);
  const open = chat.status === "open";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={entry.accessibilityLabel}
      accessibilityHint={entry.detail}
      className="gg-card flex-row items-center gap-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-pill"
        style={{ backgroundColor: open ? colors.accent : colors.surfaceVariant }}
      >
        <MessageCircle size={18} color={open ? colors.accentOn : colors.textSecondary} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-body font-medium text-text-primary">{entry.title}</Text>
        <Text className="text-caption text-text-muted">{entry.detail}</Text>
      </View>
      <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
    </Pressable>
  );
}
