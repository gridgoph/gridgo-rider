import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { ConfirmSheetBody } from "@/components/ConfirmSheetBody";
import { InlineNotice } from "@/components/InlineNotice";
import { SkeletonBar } from "@/components/Skeleton";
import { useTripOrder } from "@/hooks/useTripOrder";
import * as api from "@/lib/api";
import { dropoffLabel } from "@/lib/riderOrder";
import { useActiveTrip } from "@/store/activeTrip";

/**
 * Leaving the shop with the package.
 *
 * This used to fire straight off a button with no confirmation, which is the
 * one step in the trip that starts location sharing and tells the client to
 * expect a rider. A sheet is the right weight for it: content-sized, dismissed
 * by dragging down or the back gesture, and cancelling costs nothing.
 */
export default function StartDeliverySheet() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === "string" ? orderId : null;
  const { order, loading, error: loadError } = useTripOrder(id);
  const setOrder = useActiveTrip((s) => s.setOrder);

  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function start() {
    if (!order) return;
    setBusy(true);
    setSubmitError(null);
    try {
      setOrder(await api.transitionOrder(order.id, "out_for_delivery"));
      router.back();
    } catch (e) {
      setSubmitError(
        api.apiErrorMessage(
          e,
          "The trip did not start. Try again before you leave the shop.",
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
      question="Set off for the client?"
      body={`GRIDGO starts sharing your position with the client and tells them you are on the way to ${dropoffLabel(order)}.`}
      confirmLabel="Yes, I am leaving now"
      cancelLabel="Not yet"
      busy={busy}
      onConfirm={() => void start()}
      onCancel={() => router.back()}
    >
      {submitError ? (
        <InlineNotice tone="error" icon="circle-x" title="Trip not started" body={submitError} />
      ) : (
        <Text className="text-caption text-text-muted">
          Sharing stops the moment the delivery is closed. Nothing is kept on this phone.
        </Text>
      )}
    </ConfirmSheetBody>
  );
}
