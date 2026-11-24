import { House } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { Order } from "@/lib/api";
import { homeBarangay, isHomePrinter } from "@/lib/homePrinter";

type Props = {
  order: Partial<Pick<Order, "printerType" | "barangay" | "supplierContact" | "pickup">>;
};

/**
 * "Home printer · Barangay" with a house — how a rider tells, before they
 * accept, that the pickup is someone's home rather than a shop. Monochrome on
 * the grouping panel, like the group tag, so it informs without competing with
 * Accept. Renders nothing on a shop job.
 */
export function HomePrinterTag({ order }: Props) {
  const colors = useThemeColors();
  if (!isHomePrinter(order)) return null;
  const barangay = homeBarangay(order);
  const line = barangay ? `Home printer · ${barangay}` : "Home printer";
  return (
    <View
      className="flex-row items-center gap-2 self-start rounded-pill bg-surface-variant px-3 py-1.5"
      accessible
      accessibilityRole="text"
      accessibilityLabel={barangay ? `Pickup at a home printer in ${barangay}` : "Pickup at a home printer"}
      testID="home-printer-tag"
    >
      <House size={16} color={colors.textPrimary} strokeWidth={2} />
      <Text className="text-caption font-bold text-text-primary" numberOfLines={1}>
        {line}
      </Text>
    </View>
  );
}
