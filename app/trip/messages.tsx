import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";

import { DeliveryChatConversation } from "@/components/DeliveryChatConversation";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";

/**
 * Messages with the client on one delivery (gridgo-client#198). Opened from
 * the trip or a past job; `lib/deliveryChat.ts` holds the rules and the words.
 */
export default function TripMessagesScreen() {
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
              Open your trip to message its client.
            </Text>
          </View>
          <SecondaryButton label="Back to the trip" onPress={backToTrip} />
        </View>
      </Screen>
    );
  }

  return <DeliveryChatConversation orderId={id} onBackToTrip={backToTrip} />;
}
