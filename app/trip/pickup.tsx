import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text } from "react-native";

import { EvidenceCapture } from "@/components/EvidenceCapture";
import { InlineNotice } from "@/components/InlineNotice";
import { OtpInput } from "@/components/OtpInput";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { LoadingCard } from "@/components/Skeleton";
import { StickyActionBar } from "@/components/StickyActionBar";
import { TripStepHeader } from "@/components/TripStepHeader";
import { useProofEvidence } from "@/hooks/useProofEvidence";
import { useTripOrder } from "@/hooks/useTripOrder";
import * as api from "@/lib/api";
import { evidenceBlockReason } from "@/lib/proofEvidence";
import { pickupLabel } from "@/lib/riderOrder";
import { useTripProof } from "@/store/tripProof";

const OTP_LENGTH = 4;

/**
 * Pickup proof at the supplier counter.
 *
 * One job on one screen: read the code, photograph the package, confirm. The
 * code and the photo both have to be in before the yellow button does anything,
 * and the button says why when it will not.
 */
export default function PickupProofScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === "string" ? orderId : null;
  const { order, loading, error: loadError } = useTripOrder(id);

  const { getDraft, saveDraft, clearDraft, hydrated, hydrate } = useTripProof();
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // A half-filled pickup survives the app being killed at the counter.
  useEffect(() => {
    if (!hydrated || !id || restored) return;
    const draft = getDraft(id, "pickup");
    if (draft?.otp) setOtp(draft.otp);
    setRestored(true);
  }, [hydrated, id, restored, getDraft]);

  const evidence = useProofEvidence({
    orderId: id ?? "",
    step: "pickup",
  });

  const blocked =
    otp.length < OTP_LENGTH
      ? `Enter the ${OTP_LENGTH}-digit code the supplier gives you.`
      : evidenceBlockReason(
          evidence.evidence,
          evidence.upload,
          "Photograph the package on the counter before confirming.",
        );

  async function confirmPickup() {
    if (!order || blocked) return;
    setBusy(true);
    setSubmitError(null);
    try {
      await api.submitProof(order.id, {
        kind: "pickup",
        otp,
        photoName: evidence.evidence?.fileName,
        note: "Package collected from the supplier",
      });
      clearDraft(order.id, "pickup");
      router.back();
    } catch (e) {
      setSubmitError(
        api.apiErrorMessage(
          e,
          "The pickup was not recorded. Check the code with the supplier and try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={["bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="gg-page gap-8 pb-8 pt-6"
          keyboardShouldPersistTaps="handled"
        >
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
              <TripStepHeader
                order={order}
                stopKind="pickup"
                stopLabel={pickupLabel(order)}
              />

              <OtpInput
                value={otp}
                onChange={(next) => {
                  setOtp(next);
                  if (id) saveDraft(id, "pickup", { otp: next });
                }}
                length={OTP_LENGTH}
                label="Pickup code"
                helper="Ask the supplier for the code on their job sheet."
                disabled={busy}
              />

              <EvidenceCapture
                title="Photo of the package"
                instruction="Photograph the finished job on the counter, with the label showing."
                evidence={evidence.evidence}
                upload={evidence.upload}
                captureError={evidence.captureError}
                cameraBlocked={evidence.cameraBlocked}
                onTakePhoto={() => void evidence.takePhoto()}
                onRetry={evidence.retry}
                onClear={evidence.clear}
                disabled={busy}
              />

              {submitError ? (
                <InlineNotice
                  tone="error"
                  icon="circle-x"
                  title="Pickup not recorded"
                  body={submitError}
                />
              ) : null}
            </>
          ) : null}
        </ScrollView>

        {order ? (
          <StickyActionBar>
            <PrimaryButton
              label={busy ? "Recording…" : "Confirm pickup"}
              onPress={() => void confirmPickup()}
              disabled={busy || Boolean(blocked)}
              size="large"
            />
            {blocked ? (
              <Text className="text-center text-body text-text-secondary">{blocked}</Text>
            ) : null}
          </StickyActionBar>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}
