import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import { InlineNotice } from "@/components/InlineNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SignOffSkeleton } from "@/components/SkeletonScreens";
import { StickyActionBar } from "@/components/StickyActionBar";
import { TripStepHeader } from "@/components/TripStepHeader";
import { useTripOrder } from "@/hooks/useTripOrder";
import { pickupLabel } from "@/lib/riderOrder";

/**
 * Closing the quality checkpoint, out loud.
 *
 * This is a trained step, not a receipt: the rider says the line to the
 * supplier, and saying it is what closes the checkpoint between two people who
 * have just handed a paid job between them. So the screen is an instruction —
 * the line is the largest thing on it and the button is the rider reporting
 * that they said it, not the app congratulating them.
 *
 * The words come from the server, on the order, so the app can never drift from
 * what the team trained. Nothing is submitted here; the checks already moved
 * the job. Backing out costs nothing and the step reappears on the trip screen.
 */
export default function SignOffScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === "string" ? orderId : null;
  const { order, loading, error: loadError } = useTripOrder(id);

  const prompt = order?.pickupChecklist?.signOffPrompt?.trim();

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="flex-1" contentContainerClassName="gg-page gap-6 pb-8 pt-6">
        {loading ? <SignOffSkeleton /> : null}

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
            <TripStepHeader order={order} stopKind="pickup" stopLabel={pickupLabel(order)} />

            <InlineNotice
              tone="success"
              icon="circle-check"
              title="All six checks passed"
              body="The package is yours to carry. One thing left before you ride."
            />

            {prompt ? (
              <View className="gap-3 rounded-card border-2 border-accent bg-surface p-6">
                <Text className="text-overline text-text-muted">SAY THIS TO THE SUPPLIER</Text>
                <Text
                  className="text-h1 text-text-primary"
                  accessibilityRole="text"
                  accessibilityLabel={`Say to the supplier: ${prompt}`}
                >
                  {prompt}
                </Text>
              </View>
            ) : null}

            <Text className="text-body text-text-secondary">
              Out loud, to whoever handed it over. It is how the supplier knows the check is
              done and closed, and it is what keeps the handover a conversation rather than a
              signature on a phone.
            </Text>
          </>
        ) : null}
      </ScrollView>

      {order ? (
        <StickyActionBar>
          <PrimaryButton label="Said it — on my way" onPress={() => router.back()} size="large" />
        </StickyActionBar>
      ) : null}
    </Screen>
  );
}
