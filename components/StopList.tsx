import { Text, View } from "react-native";

type Props = {
  pickup: string;
  dropoff: string;
};

/**
 * Pickup above drop-off, joined by the line you ride between them.
 *
 * The offer list used to draw both stops as full bordered cards, which pushed
 * the fee — the number the decision actually turns on — off the bottom of the
 * screen. Two labelled lines and a connector carry the same two facts in a
 * fifth of the height. Square mark for pickup, round for drop-off, so it still
 * reads in greyscale.
 */
export function StopList({ pickup, dropoff }: Props) {
  return (
    <View className="gap-0" accessibilityRole="text">
      <View className="flex-row gap-3">
        <View className="items-center">
          <View className="mt-1 h-2.5 w-2.5 rounded-sm border-2 border-accent" />
          <View className="w-px flex-1 bg-outline" />
        </View>
        <View className="min-w-0 flex-1 pb-3">
          <Text className="text-overline text-text-muted">PICKUP</Text>
          <Text className="text-body-lg text-text-primary">{pickup}</Text>
        </View>
      </View>
      <View className="flex-row gap-3">
        <View className="items-center">
          <View className="mt-1 h-2.5 w-2.5 rounded-pill bg-accent" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-overline text-text-muted">DROP-OFF</Text>
          <Text className="text-body-lg text-text-primary">{dropoff}</Text>
        </View>
      </View>
    </View>
  );
}
