import { Check } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  handedOver: boolean;
  onToggle: () => void;
  disabled?: boolean;
};

export const RECEIPT_TICK_LABEL = "Receipt handed over";

/**
 * The acknowledgement receipt, at the client's door.
 *
 * The pilot's only receipt: the captain decided (25 Sep 2026) that riders hand
 * the client an acknowledgement receipt with the package, beside the spoken
 * thank-you. Drawn in the sign-off card's language — an overline naming who it
 * is for, then the instruction — so the two trained moments read as one family.
 *
 * The tick is the rider's own reminder and nothing more. It never blocks the
 * delivery and never leaves the phone: the delivery route takes evidence only.
 * It is a checkbox rather than a Pass/Problem pair because there is no second
 * answer to give — a rider who has not handed it over simply has not yet.
 */
export function ReceiptReminder({ handedOver, onToggle, disabled = false }: Props) {
  const colors = useThemeColors();

  return (
    <View className="gap-3 rounded-card border-2 border-accent bg-surface p-6">
      <Text className="text-overline text-text-muted">HAND THIS TO THE CLIENT</Text>
      <Text className="text-h3 text-text-primary">Acknowledgement receipt</Text>
      <Text className="text-body text-text-secondary">
        Give the client an acknowledgement receipt with the package, as well as your thank-you.
      </Text>

      <Pressable
        onPress={onToggle}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: handedOver, disabled }}
        accessibilityLabel={RECEIPT_TICK_LABEL}
        className="min-h-11 flex-row items-center gap-3"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <View
          className={
            handedOver
              ? "h-6 w-6 items-center justify-center rounded-sm bg-accent"
              : "h-6 w-6 items-center justify-center rounded-sm border-2 border-outline"
          }
        >
          {handedOver ? <Check size={16} color={colors.accentOn} strokeWidth={3} /> : null}
        </View>
        <Text className="text-body-lg text-text-primary">{RECEIPT_TICK_LABEL}</Text>
      </Pressable>
    </View>
  );
}
