import { Text, View } from "react-native";

import { ForcedByGridgo } from "@/components/ForcedByGridgo";
import { OrderReference } from "@/components/OrderReference";
import { NavigateButton } from "@/components/NavigateButton";
import type { Order } from "@/lib/api";

type Props = {
  order: Order;
  /** Where the rider is standing while they do this step. */
  stopLabel: string;
  stopKind: "pickup" | "dropoff";
  /**
   * Offer Google Maps to this stop. Only the first screen of each stop takes
   * it — the rider may still be riding there. Once the supplier is signing or
   * the package is held at the counter, a way out of the app is noise.
   */
  navigate?: boolean;
};

/**
 * Which job, and where. The one thing a proof screen must state before it asks
 * for anything.
 *
 * Deliberately quiet: on these screens the action is the loud element, and a
 * heavy header competes with it. Overline, title, order reference, stop — no
 * status chip. The screen title in the navigation bar already says which step
 * this is. The one exception is "Forced by GRIDGO", which changes what the
 * rider is checking for and so has to be read before the step starts.
 */
export function TripStepHeader({ order, stopLabel, stopKind, navigate = false }: Props) {
  return (
    <View className="gap-1">
      <Text className="text-overline text-text-muted">
        {stopKind === "pickup" ? "AT THE SHOP" : "AT THE DOOR"}
      </Text>
      <Text className="text-h2 text-text-primary">{order.title}</Text>
      <OrderReference id={order.id} />
      <Text className="text-body-lg text-text-secondary">{stopLabel}</Text>
      {order.forcedByGridgo ? (
        <View className="mt-2">
          <ForcedByGridgo order={order} />
        </View>
      ) : null}
      {navigate ? (
        <View className="mt-3">
          <NavigateButton order={order} stopKind={stopKind} />
        </View>
      ) : null}
    </View>
  );
}
