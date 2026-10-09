import { Phone } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { TripChatParty } from "@/lib/tripChat";

type Props = { party: TripChatParty; onPress: () => void };

/**
 * Call the client or the shop, sitting at the end of that person's message
 * row so the two ways to reach one person read as one pair, and the two people
 * never read as one control twice. Monochrome: the trip's one yellow is its
 * next step.
 */
export function CallPartyButton({ party, onPress }: Props) {
  const colors = useThemeColors();
  const who = party === "shop" ? "the shop" : "the client";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Call ${who}`}
      accessibilityHint="An internet call inside GRIDGO. No phone number is shared."
      className="gg-card items-center justify-center gap-1 px-3"
      style={({ pressed }) => ({ minWidth: 76, opacity: pressed ? 0.7 : 1 })}
    >
      <View className="h-10 w-10 items-center justify-center rounded-pill bg-accent">
        <Phone size={18} color={colors.accentOn} strokeWidth={2} />
      </View>
      <Text className="text-caption font-bold text-text-primary">Call</Text>
    </Pressable>
  );
}
