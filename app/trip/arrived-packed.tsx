import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { ConfirmSheetBody } from "@/components/ConfirmSheetBody";
import { InlineNotice } from "@/components/InlineNotice";
import { ConfirmSheetSkeleton } from "@/components/SkeletonScreens";
import { useTripOrder } from "@/hooks/useTripOrder";
import * as api from "@/lib/api";
import { shopDisplayName } from "@/lib/handoffSignature";
import type { RiderRefusal } from "@/lib/riderRefusals";
import { useActiveTrip } from "@/store/activeTrip";

/**
 * "The shop had packed it before I could check it."
 *
 * A sheet rather than a tap on the pickup screen, because it cannot be taken
 * back: the server keeps it on the shop's record for Operations. It does not
 * excuse the check — the rider still asks for every piece to be unpacked —
 * which is why the sheet says what happens next rather than only what is
 * recorded (gridgo-api `docs/SHOP_HANDOVER_API.md`, step 1).
 */
export default function ArrivedPackedSheet() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === "string" ? orderId : null;
  const { order, loading, error: loadError } = useTripOrder(id);
  const setActiveOrder = useActiveTrip((s) => s.setOrder);

  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<RiderRefusal | null>(null);

  async function record() {
    if (!order) return;
    setBusy(true);
    setSubmitError(null);
    try {
      setActiveOrder(await api.markArrivedPacked(order.id));
      router.back();
    } catch (e) {
      setSubmitError(
        api.tripRefusal(e, "It was not recorded. Try again, or tell Operations in the shop chat."),
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <ConfirmSheetSkeleton cancelLabel="Not packed" onCancel={() => router.back()} />;
  }

  if (!order) {
    return (
      <View className="px-4 pt-4">
        <InlineNotice
          tone="error"
          icon="circle-x"
          title="This job did not load"
          body={loadError ?? "Go back to the pickup checks and try again."}
          actionLabel="Back to the checks"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  return (
    <ConfirmSheetBody
      question="Record that it was already packed?"
      body={`GRIDGO notes on ${shopDisplayName(order)}'s record that the job was packed before you could check it, and tells Operations. This cannot be undone.`}
      confirmLabel="Yes, it was packed"
      cancelLabel="Not packed"
      busy={busy}
      busyLabel="Recording…"
      onConfirm={() => void record()}
      onCancel={() => router.back()}
    >
      {submitError ? (
        <InlineNotice
          tone="error"
          icon="circle-x"
          title="Not recorded"
          body={submitError.message}
          {...(submitError.step ? { actionLabel: "Go back", onAction: () => router.back() } : {})}
        />
      ) : (
        <Text className="text-caption text-text-muted">
          You still check every piece. Ask the shop to unpack it, then run the six checks.
        </Text>
      )}
    </ConfirmSheetBody>
  );
}
