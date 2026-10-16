import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";

import { DeliveryChatConversation } from "@/components/DeliveryChatConversation";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import type { TripChatParty } from "@/lib/tripChat";

/**
 * One of a job's two conversations, opened with `?orderId=`: the client's at
 * `/trip/messages`, the shop's at `/trip/shop-messages`. Separate routes, so a
 * push or a row can only ever open the thread it names.
 */
export function TripChatScreen({ party }: { party: TripChatParty }) {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const router = useRouter();
  const id = typeof orderId === "string" && orderId ? orderId : null;

  const backToTrip = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/active");
  };

  if (!id) {
    return (
      <Screen edges={["bottom"]}>
        <View className="gg-page gap-4 pt-6">
          <View className="gg-panel items-center gap-2 py-8">
            <Text className="text-center text-body-lg font-medium text-text-primary">No job chosen</Text>
            <Text className="text-center text-body text-text-secondary">
              Open your trip to message its {party === "shop" ? "shop" : "client"}.
            </Text>
          </View>
          <SecondaryButton label="Back to the trip" onPress={backToTrip} />
        </View>
      </Screen>
    );
  }

  return (
    <DeliveryChatConversation
      key={`${party}:${id}`}
      orderId={id}
      party={party}
      onBackToTrip={backToTrip}
    />
  );
}
