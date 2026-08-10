import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { ConfirmSheetBody } from "@/components/ConfirmSheetBody";
import { InlineNotice } from "@/components/InlineNotice";
import { SkeletonBar } from "@/components/Skeleton";
import { useTripOrder } from "@/hooks/useTripOrder";
import * as api from "@/lib/api";
import { pickupLabel } from "@/lib/riderOrder";
import { useTripProof } from "@/store/tripProof";

/**
 * Handing an undelivered package back to the shop it came from.
 *
 * The last step of a failed delivery, and the one that ends the rider's
 * responsibility for the package — so it names the shop and is confirmed
 * rather than fired from a list.
 */
export default function HandbackSheet() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === "string" ? orderId : null;
  const { order, loading, error: loadError } = useTripOrder(id);
  const recordReturned = useTripProof((s) => s.recordReturned);

  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handBack() {
    if (!order) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const { proof } = await api.submitProof(order.id, {
        kind: "failure",
        reason: "returned",
        note: `Package handed back to ${pickupLabel(order)}`,
      });
      recordReturned(order.id, proof.at);
      router.back();
    } catch (e) {
      setSubmitError(
        api.apiErrorMessage(
          e,
          "The handover was not recorded. Try again before you leave the shop.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View className="gap-3 px-4 pt-4" accessibilityLabel="Loading the job">
        <SkeletonBar width="70%" height={22} />
        <SkeletonBar width="100%" height={16} />
        <SkeletonBar width="100%" height={48} />
      </View>
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
      question={`Hand the package back to ${pickupLabel(order)}?`}
      body="Do this at the counter, with someone taking it from you. Operations reschedules the delivery from there, and the job leaves your phone."
      confirmLabel="Yes, they have it"
      cancelLabel="Not yet"
      busy={busy}
      onConfirm={() => void handBack()}
      onCancel={() => router.back()}
    >
      {submitError ? (
        <InlineNotice
          tone="error"
          icon="circle-x"
          title="Handover not recorded"
          body={submitError}
        />
      ) : null}
    </ConfirmSheetBody>
  );
}
