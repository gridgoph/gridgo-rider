import { Package } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { Order } from "@/lib/api";
import { deliveryPartLabel } from "@/lib/riderOrder";

type Props = {
  order: Pick<Order, "deliveryNumber" | "shopDeliveryCount">;
};

/**
 * "Delivery 1 of 2" beside the order reference when the client split one
 * shop's products into separate deliveries. The shop may hand over the other
 * parcel to another rider at the same counter, so this says which one is
 * this job. Renders nothing for an ordinary single delivery.
 */
export function DeliveryPart({ order }: Props) {
  const colors = useThemeColors();
  const label = deliveryPartLabel(order);
  if (!label) return null;

  return (
    <View className="flex-row items-center gap-1 self-start" accessible accessibilityRole="text" accessibilityLabel={label}>
      <Package size={14} color={colors.textMuted} strokeWidth={2} />
      <Text className="text-caption font-medium text-text-secondary">{label}</Text>
    </View>
  );
}
