import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text } from "react-native";

import { BlockingOverlay } from "@/components/BlockingOverlay";
import { EvidenceCapture } from "@/components/EvidenceCapture";
import { InlineNotice } from "@/components/InlineNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { ProofStepSkeleton } from "@/components/SkeletonScreens";
import { StickyActionBar } from "@/components/StickyActionBar";
import { TripStepHeader } from "@/components/TripStepHeader";
import { useProofEvidence } from "@/hooks/useProofEvidence";
import { useTripOrder } from "@/hooks/useTripOrder";
import * as api from "@/lib/api";
import { DELIVERY_TARGETS } from "@/lib/attachments";
import { evidenceBlockReason } from "@/lib/proofEvidence";
import { dropoffLabel, isBalanceConfirmed } from "@/lib/riderOrder";
import { useActiveTrip } from "@/store/activeTrip";

/**
 * Delivery proof at the door — the hard gate.
 *
 * A delivery is not complete until the server holds the file. The confirm
 * button stays disabled, with the reason underneath it, until the upload comes
 * back stored. A photo is the default; a signature is accepted when the camera
 * cannot run, because a denied permission must not strand a rider holding
 * someone's paid print job.
 *
 * One capture, stored twice: the rider's evidence that the handover happened,
 * and the delivered Proof of Fulfilment that releases the supplier's third
 * milestone. The server binds a file to one purpose only, so the alternative
 * was asking a rider to photograph the same doorstep twice.
 *
 * No money is handled here and none is shown. The client's final 25% is
 * digital and confirmed by Operations before this screen will let anything
 * through — which is a status the rider needs, not an amount.
 */
export default function DeliveryProofScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === "string" ? orderId : null;
  const { order, loading, error: loadError, reload } = useTripOrder(id);
  const setActiveOrder = useActiveTrip((s) => s.setOrder);

  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [storage, setStorage] = useState<"available" | "unavailable" | "unknown">("unknown");

  // Tell the rider up front when this server cannot hold files, rather than
  // letting them photograph a doorway and discover it on the upload.
  useEffect(() => {
    let cancelled = false;
    void api
      .health()
      .then((result) => {
        if (!cancelled) setStorage(api.storageStatus(result));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const evidence = useProofEvidence({
    orderId: id ?? "",
    step: "delivery",
    targets: DELIVERY_TARGETS,
  });

  const balanceHeld = order ? !isBalanceConfirmed(order) : false;
  const evidenceFileId = evidence.stored.delivery_photo ?? null;

  const blocked = !order
    ? "Loading the job."
    : balanceHeld
      ? "Operations has not confirmed the client's final payment. Call them before you hand the package over."
      : evidenceBlockReason(
          evidence.evidence,
          evidence.upload,
          "Photograph the package at the door. If the camera will not open, capture a signature instead.",
        );

  async function confirmDelivery() {
    if (!order || blocked || !evidenceFileId) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const updated = await api.recordDelivery(order.id, {
        evidenceFileId,
        evidenceType: evidence.evidence?.kind === "signature" ? "signature" : "photo",
      });
      setActiveOrder(updated);
      router.back();
    } catch (e) {
      setSubmitError(
        api.apiErrorMessage(
          e,
          "The delivery was not recorded. Do not leave until it shows as recorded — try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={["bottom"]}>
      {/* No field on this screen — evidence is a camera capture or a signature
          pad, so this is a plain scroll rather than the keyboard-aware one. */}
      <ScrollView className="flex-1" contentContainerClassName="gg-page gap-8 pb-8 pt-6">
        {loading ? <ProofStepSkeleton /> : null}

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

            {balanceHeld ? (
              <InlineNotice
                tone="warning"
                icon="triangle-alert"
                title="The client's final payment is not confirmed yet"
                body="GRIDGO cannot close a delivery until Operations has confirmed it. Do not hand the package over — call Operations, and check again once they have."
                actionLabel="Check again"
                onAction={() => void reload()}
              />
            ) : null}

            {storage === "unavailable" ? (
              <InlineNotice
                tone="error"
                icon="circle-x"
                title="Photo storage is offline"
                body="Evidence cannot reach the server, so this delivery cannot be proven yet. Do not hand the package over — tell Operations."
              />
            ) : null}

            <EvidenceCapture
              title="Evidence at the door"
              instruction="Photograph the package with the door or gate number in frame. It is both your proof of handover and the supplier's proof the job was fulfilled."
              evidence={evidence.evidence}
              upload={evidence.upload}
              captureError={evidence.captureError}
              cameraBlocked={evidence.cameraBlocked}
              onTakePhoto={() => void evidence.takePhoto()}
              onRetry={evidence.retry}
              onClear={evidence.clear}
              onSignature={evidence.attachSignature}
              disabled={busy || balanceHeld}
            />

            {submitError ? (
              <InlineNotice
                tone="error"
                icon="circle-x"
                title="Delivery not recorded"
                body={submitError}
              />
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {order ? (
        <StickyActionBar>
          <PrimaryButton
            label={busy ? "Recording…" : "Confirm delivery"}
            onPress={() => void confirmDelivery()}
            disabled={busy || Boolean(blocked)}
            size="large"
          />
          {blocked ? (
            <Text className="text-center text-body text-text-secondary">{blocked}</Text>
          ) : null}
        </StickyActionBar>
      ) : null}

      <BlockingOverlay visible={busy} label="Recording the delivery…" />
    </Screen>
  );
}
