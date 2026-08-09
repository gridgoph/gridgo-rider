import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { InlineNotice } from "@/components/InlineNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { TripStepHeader } from "@/components/TripStepHeader";
import { useThemeColors } from "@/hooks/useTheme";
import { useTripOrder } from "@/hooks/useTripOrder";
import * as api from "@/lib/api";
import { codAmountDueMinor, dropoffLabel } from "@/lib/riderOrder";

/**
 * Cash on delivery.
 *
 * The highest-consequence screen in the app: a misread amount is money the
 * rider loses out of their own pocket. So the amount is the largest thing on
 * the screen, it is the only number on the screen, and recording it takes a
 * deliberate second tap that names the exact figure being claimed.
 */
export default function CodScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === "string" ? orderId : null;
  const { order, loading, error: loadError } = useTripOrder(id);

  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const amount = order ? api.formatPhp(codAmountDueMinor(order)) : "";

  async function recordCollection() {
    if (!order) return;
    setBusy(true);
    setSubmitError(null);
    try {
      await api.submitProof(order.id, {
        kind: "cod",
        note: `Collected ${amount} in cash from the client`,
      });
      setConfirming(false);
      router.back();
    } catch (e) {
      setConfirming(false);
      setSubmitError(
        api.apiErrorMessage(
          e,
          "The collection was not recorded. Do not leave until it shows as recorded — try again here.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="gg-screen" edges={["bottom"]}>
      <ScrollView className="flex-1" contentContainerClassName="gg-page gap-8 pb-10 pt-6">
        {loading ? (
          <View className="items-center gap-3 pt-10">
            <ActivityIndicator color={colors.textMuted} />
            <Text className="text-body text-text-muted">Loading the job…</Text>
          </View>
        ) : null}

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

            {submitError ? (
              <InlineNotice
                tone="error"
                icon="circle-x"
                title="Collection not recorded"
                body={submitError}
              />
            ) : null}

            <View className="gap-3">
              <PrimaryButton
                label={`I have ${amount} in hand`}
                onPress={() => setConfirming(true)}
                disabled={busy}
                size="large"
              />
              <SecondaryButton
                label="Not yet — go back"
                onPress={() => router.back()}
                disabled={busy}
              />
            </View>
          </>
        ) : null}
      </ScrollView>

      <ConfirmDialog
        visible={confirming}
        question={`Record ${amount} as collected?`}
        body="GRIDGO will treat this cash as yours to hand in. If the client pays less than this, do not record it — call Operations instead."
        confirmLabel={`Yes, I collected ${amount}`}
        cancelLabel="Go back and count again"
        busy={busy}
        onConfirm={() => void recordCollection()}
        onCancel={() => setConfirming(false)}
      />
    </SafeAreaView>
  );
}
