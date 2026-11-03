import { Check } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  pickup: string;
  dropoff: string;
  /** Stops already behind the rider, on a job in hand. Offers have none. */
  done?: { pickup?: boolean; dropoff?: boolean };
};

/**
 * Pickup above drop-off, joined by the line you ride between them.
 *
 * The offer list used to draw both stops as full bordered cards, which pushed
 * the fee — the number the decision actually turns on — off the bottom of the
 * screen. Two labelled lines and a connector carry the same two facts in a
 * fifth of the height. Square mark for pickup, round for drop-off, so it still
 * reads in greyscale; a stop already passed says DONE beside a tick.
 */
export function StopList({ pickup, dropoff, done }: Props) {
  return (
    <View className="gap-0" accessibilityRole="text">
      <View className="flex-row gap-3">
        <View className="items-center">
          <View className="mt-1 h-2.5 w-2.5 rounded-sm border-2 border-accent" />
          <View className="w-px flex-1 bg-outline" />
        </View>
        <View className="min-w-0 flex-1 pb-3">
          <StopOverline label="PICKUP" done={done?.pickup} />
          <Text className="text-body-lg text-text-primary">{pickup}</Text>
        </View>
      </View>
      <View className="flex-row gap-3">
        <View className="items-center">
          <View className="mt-1 h-2.5 w-2.5 rounded-pill bg-accent" />
        </View>
        <View className="min-w-0 flex-1">
          <StopOverline label="DROP-OFF" done={done?.dropoff} />
          <Text className="text-body-lg text-text-primary">{dropoff}</Text>
        </View>
      </View>
    </View>
  );
}

function StopOverline({ label, done }: { label: string; done?: boolean }) {
  const colors = useThemeColors();
  if (!done) return <Text className="text-overline text-text-muted">{label}</Text>;
  return (
    <View className="flex-row items-center gap-1">
      <Text className="text-overline text-text-muted">{label} · DONE</Text>
      <Check size={12} color={colors.success} strokeWidth={3} />
    </View>
  );
}
