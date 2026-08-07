import { MapPinned } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  /** When true, location is being posted for the active trip. */
  sharing: boolean;
};

/**
 * Explicit privacy indication. Location is shared only while a trip is in
 * transit, never persisted, and this banner is the visible contract.
 */
export function LocationSharingBanner({ sharing }: Props) {
  const colors = useThemeColors();

  if (!sharing) return null;

  return (
    <View
      className="flex-row items-center gap-3 rounded-card border border-info bg-surface p-3"
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel="Location is being shared for this trip"
    >
      <View className="h-11 w-11 items-center justify-center rounded-pill border border-info">
        <MapPinned size={20} color={colors.info} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-body text-text-primary">Location sharing on</Text>
        <Text className="mt-0.5 text-caption text-text-secondary">
          Your position is sent only while this trip is active. Sharing stops
          when the trip ends. Nothing is saved on this device.
        </Text>
      </View>
    </View>
  );
}
