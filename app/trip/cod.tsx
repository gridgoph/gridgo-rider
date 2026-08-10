import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import { InlineNotice } from "@/components/InlineNotice";
import { Screen } from "@/components/Screen";
import { LoadingCard } from "@/components/Skeleton";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StickyActionBar } from "@/components/StickyActionBar";
import { TripStepHeader } from "@/components/TripStepHeader";
import { useTripOrder } from "@/hooks/useTripOrder";
import * as api from "@/lib/api";
import { codAmountDueMinor, dropoffLabel } from "@/lib/riderOrder";

/**
 * Cash on delivery.
 *
 * The highest-consequence screen in the app: a misread amount is money the
 * rider loses out of their own pocket. So the amount is the largest thing on
 * the screen, it is the only number on the screen, and recording it takes a
 * deliberate second tap — a sheet that names the exact figure being claimed.
 */
export default function CodScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === "string" ? orderId : null;
  const { order, loading, error: loadError } = useTripOrder(id);

  const amount = order ? api.formatPhp(codAmountDueMinor(order)) : "";

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="flex-1" contentContainerClassName="gg-page gap-6 pb-8 pt-6">
        {loading ? <LoadingCard label="Loading the job" rows={3} /> : null}

        {loadError ? (
          <InlineNotice
            tone="error"
            icon="circle-x"
            title="This job did not load"
            body={loadError}
            actionLabel="Back to the trip"
            onAction={() => router.back()}
          />
        ) : null}

        {order ? (
          <>
            <TripStepHeader order={order} stopKind="dropoff" stopLabel={dropoffLabel(order)} />

            <View className="gap-3 rounded-card border-2 border-accent bg-surface p-6">
              <Text className="text-overline text-text-muted">COLLECT IN CASH</Text>
              <Text
                className="text-display text-text-primary"
                accessibilityRole="text"
                accessibilityLabel={`Collect ${amount} in cash`}
              >
                {amount}
              </Text>
              <Text className="text-body-lg text-text-secondary">
                The order total plus the delivery fee. Count it in front of the client before
                you record it.
              </Text>
            </View>

            <Text className="text-body text-text-secondary">
              If the client hands over less than this, record nothing and call Operations.
              A short collection recorded as complete comes out of your own pay.
            </Text>
          </>
        ) : null}
      </ScrollView>

      {order ? (
        <StickyActionBar>
          <PrimaryButton
            label={`I have ${amount} in hand`}
            onPress={() =>
              router.push({ pathname: "/trip/cod-confirm", params: { orderId: order.id } })
            }
            size="large"
          />
          <SecondaryButton label="Not yet — go back" onPress={() => router.back()} />
        </StickyActionBar>
      ) : null}
    </Screen>
  );
}
