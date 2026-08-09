import { Text, View } from "react-native";

import type { Order } from "@/lib/api";

type Props = {
  order: Order;
  /** Where the rider is standing while they do this step. */
  stopLabel: string;
  stopKind: "pickup" | "dropoff";
};

/**
 * Which job, and where. The one thing a proof screen must state before it asks
 * for anything.
 *
 * Deliberately quiet: on these screens the action is the loud element, and a
 * heavy header competes with it. Two lines, no chip, no icon — the screen title
 * in the navigation bar already says which step this is.
 */
export function TripStepHeader({ order, stopLabel, stopKind }: Props) {
  return (
    <View className="gap-1">
      <Text className="text-overline text-text-muted">
        {stopKind === "pickup" ? "AT THE SHOP" : "AT THE DOOR"}
      </Text>
      <Text className="text-h2 text-text-primary">{order.title}</Text>
      <Text className="text-body-lg text-text-secondary">{stopLabel}</Text>
    </View>
  );
}
