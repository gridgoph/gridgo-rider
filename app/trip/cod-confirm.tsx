import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { ConfirmSheetBody } from "@/components/ConfirmSheetBody";
import { InlineNotice } from "@/components/InlineNotice";
import { ConfirmSheetSkeleton } from "@/components/SkeletonScreens";
import { useTripOrder } from "@/hooks/useTripOrder";
import * as api from "@/lib/api";
import { codAmountDueMinor } from "@/lib/riderOrder";
import { useActiveTrip } from "@/store/activeTrip";

/**
 * The second tap on cash.
 *
 * Money is the one thing in this app a rider pays for out of their own pocket
 * when it goes wrong, so recording it takes a deliberate confirmation that
 * names the exact figure being claimed. Backing out is the safe direction, so
 * the sheet dismisses the way the platform expects — drag, back gesture, or
 * the cancel button — and records nothing when it does.
 */
export default function CodConfirmSheet() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === "string" ? orderId : null;
  const { order, loading, error: loadError } = useTripOrder(id);
  const setOrder = useActiveTrip((s) => s.setOrder);

  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const amount = order ? api.formatPhp(codAmountDueMinor(order)) : "";

  async function record() {
    if (!order) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const result = await api.submitProof(order.id, {
        kind: "cod",
        note: `Collected ${amount} in cash from the client`,
      });
      setOrder(result.order);
      // Back past the sheet and the cash screen, to the trip.
      router.back();
      router.back();
    } catch (e) {
      setSubmitError(
        api.apiErrorMessage(
          e,
          "The collection was not recorded. Do not leave until it shows as recorded — try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <ConfirmSheetSkeleton
        cancelLabel="Go back and count again"
        onCancel={() => router.back()}
      />
    );
  }

  if (!order) {
    return (
      <View className="px-4 pt-4">
        <InlineNotice
          tone="error"
          icon="circle-x"
          title="This job did not load"
          body={loadError ?? "Go back to your trip and try again."}
          actionLabel="Back to the trip"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  return (
    <ConfirmSheetBody
      question={`Record ${amount} as collected?`}
      body="GRIDGO will treat this cash as yours to hand in. If the client pays less than this, do not record it — call Operations instead."
      confirmLabel={`Yes, I collected ${amount}`}
      cancelLabel="Go back and count again"
      busy={busy}
      onConfirm={() => void record()}
      onCancel={() => router.back()}
    >
      {submitError ? (
        <InlineNotice
          tone="error"
          icon="circle-x"
          title="Collection not recorded"
          body={submitError}
        />
      ) : null}
    </ConfirmSheetBody>
  );
}
