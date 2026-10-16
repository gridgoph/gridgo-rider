import { ChevronRight, Store, UserRound } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { deliveryChatEntry, type DeliveryChatSummary } from "@/lib/deliveryChat";
import { pickupChatEntry, unreadBadgeLabel, type PickupChatSummary } from "@/lib/pickupChat";

type Props =
  | { party?: "client"; chat: DeliveryChatSummary; onPress: () => void }
  | { party: "shop"; chat: PickupChatSummary; onPress: () => void };

/**
 * The way into one of the job's two conversations: with the client
 * (`party="client"`, the default) or with the shop (`party="shop"`). On the
 * trip while the job is this rider's, and on the trip or past job for a day
 * after, saying when the messages go.
 *
 * Each row carries the glyph of the person on the other end — a person for the
 * client, a storefront for the shop — the same glyph the conversation opens
 * under, so the two rows never read as one control twice. Messages the rider
 * has not opened show as a count on a monochrome pill. Never yellow — the
 * trip's one yellow is its next step.
 */
export function DeliveryChatRow(props: Props) {
  const colors = useThemeColors();
  const { onPress } = props;
  const shop = props.party === "shop";
  const entry = shop ? pickupChatEntry(props.chat) : deliveryChatEntry(props.chat);
  const badge = shop ? unreadBadgeLabel(props.chat.unread) : null;
  const open = props.chat.status === "open";
  const Icon = shop ? Store : UserRound;

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
        <Icon size={18} color={open ? colors.accentOn : colors.textSecondary} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-body font-medium text-text-primary">{entry.title}</Text>
        <Text className="text-caption text-text-muted">{entry.detail}</Text>
      </View>
      {badge ? (
        <View
          testID="chat-unread-badge"
          className="min-w-[28px] items-center rounded-pill bg-accent px-2 py-0.5"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <Text className="text-caption font-bold text-accent-on">{badge}</Text>
        </View>
      ) : null}
      <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
    </Pressable>
  );
}
