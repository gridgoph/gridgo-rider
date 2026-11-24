import { House } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { Order } from "@/lib/api";
import { HOME_DISCREET_NOTE, homeExactPickup, homeFindingLine } from "@/lib/homePrinter";

type Props = {
  order: Partial<Pick<Order, "printerType" | "barangay" | "supplierContact" | "pickup">>;
};

/**
 * The one thing to know before riding to a home printer: it is someone's
 * home. Shown only while the API gives this rider the exact pin, with the
 * printer's own landmark and kind of home to find the right door. Once the
 * job ends the API stops sending the pin and this disappears with it.
 */
export function HomePickupNote({ order }: Props) {
  const colors = useThemeColors();
  const pickup = homeExactPickup(order);
  if (!pickup) return null;
  const finding = homeFindingLine(pickup);
  return (
    <View
      className="flex-row items-start gap-3 rounded-field bg-surface-variant p-3"
      accessible
      accessibilityRole="text"
      accessibilityLabel={finding ? `${HOME_DISCREET_NOTE} ${finding}` : HOME_DISCREET_NOTE}
      testID="home-pickup-note"
    >
      <View className="pt-0.5">
        <House size={18} color={colors.textPrimary} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-bold text-text-primary">{HOME_DISCREET_NOTE}</Text>
        {finding ? <Text className="text-body text-text-secondary">{finding}</Text> : null}
      </View>
    </View>
  );
}
