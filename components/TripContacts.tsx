import { useRouter } from "expo-router";
import { Text, useWindowDimensions, View } from "react-native";

import { CallPartyButton } from "@/components/CallPartyButton";
import { DeliveryChatRow } from "@/components/DeliveryChatRow";
import { deliveryChatOf, deliveryChatRoute } from "@/lib/deliveryChat";
import { callWindow } from "@/lib/orderCalls";
import { pickupChatOf, pickupChatRoute } from "@/lib/pickupChat";
import { tripChatOrder, type TripChatParty } from "@/lib/tripChat";

type Props = {
  trip: { id: string; state: string; deliveryChat?: unknown; pickupChat?: unknown };
  onCall: (party: TripChatParty) => void;
};

/**
 * The shop and the client, each a tap away while the job is this rider's and
 * readable for a day after. Two people, two rows: the one the rider is heading
 * to comes first.
 *
 * Each person's Call sits at the end of their own message row, only while the
 * API's call window for them is open — the client for a door delivery, the
 * shop until pick-up. After pick-up the shop row says why its Call went rather
 * than dropping it without a word.
 */
export function TripContacts({ trip, onCall }: Props) {
  const router = useRouter();
  const { width, fontScale } = useWindowDimensions();
  // Large text or a narrow phone: Call goes under the row instead of beside it.
  const stacked = fontScale >= 1.2 || width < 360;
  const deliveryChat = deliveryChatOf(trip);
  const pickupChat = pickupChatOf(trip);

  return (
    <>
      {tripChatOrder(trip.state).map((party) => {
        const window = callWindow(trip, party);
        const row =
          party === "shop" ? (
            pickupChat ? (
              <DeliveryChatRow party="shop" chat={pickupChat} onPress={() => router.push(pickupChatRoute(trip.id))} />
            ) : null
          ) : deliveryChat ? (
            <DeliveryChatRow chat={deliveryChat} onPress={() => router.push(deliveryChatRoute(trip.id))} />
          ) : null;
        if (!row) return null;
        return (
          <View key={party} className="gap-2">
            {stacked ? (
              <>
                {row}
                {window.open ? <CallPartyButton party={party} layout="wide" onPress={() => onCall(party)} /> : null}
              </>
            ) : (
              <View className="flex-row items-stretch gap-2">
                <View className="min-w-0 flex-1">{row}</View>
                {window.open ? <CallPartyButton party={party} onPress={() => onCall(party)} /> : null}
              </View>
            )}
            {!window.open && window.note ? <Text className="px-1 text-caption text-text-muted">{window.note}</Text> : null}
          </View>
        );
      })}
    </>
  );
}
