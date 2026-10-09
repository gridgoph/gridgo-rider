import { Phone } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { TripChatParty } from "@/lib/tripChat";

type Props = {
  party: TripChatParty;
  onPress: () => void;
  /**
   * `column` sits at the end of the person's message row; `wide` sits under it
   * as a full-width button, for large text or a narrow phone, where a column
   * would squeeze the message row to a word per line.
   */
  layout?: "column" | "wide";
};

/**
 * Call the client or the shop, attached to that person's message row so the
 * two ways to reach one person read as one pair, and the two people never
 * read as one control twice. Monochrome: the trip's one yellow is its next step.
 */
export function CallPartyButton({ party, onPress, layout = "column" }: Props) {
  const colors = useThemeColors();
  const who = party === "shop" ? "the shop" : "the client";
  const disc = (
    <View className="h-10 w-10 items-center justify-center rounded-pill bg-accent">
      <Phone size={18} color={colors.accentOn} strokeWidth={2} />
    </View>
  );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Call ${who}`}
      accessibilityHint="An internet call inside GRIDGO. No phone number is shared."
      className={
        layout === "wide"
          ? "gg-card flex-row items-center justify-center gap-3 py-2"
          : "gg-card items-center justify-center gap-1 px-3"
      }
      style={({ pressed }) => ({ minWidth: layout === "wide" ? undefined : 76, opacity: pressed ? 0.7 : 1 })}
    >
      {disc}
      <Text className={layout === "wide" ? "text-body font-bold text-text-primary" : "text-caption font-bold text-text-primary"}>
        {layout === "wide" ? `Call ${who}` : "Call"}
      </Text>
    </Pressable>
  );
}
