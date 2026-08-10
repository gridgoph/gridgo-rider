import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EvidenceCapture } from "@/components/EvidenceCapture";
import { InlineNotice } from "@/components/InlineNotice";
import { OtpInput } from "@/components/OtpInput";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { TripStepHeader } from "@/components/TripStepHeader";
import { useProofEvidence } from "@/hooks/useProofEvidence";
import { useThemeColors } from "@/hooks/useTheme";
import { useTripOrder } from "@/hooks/useTripOrder";
import * as api from "@/lib/api";
import { evidenceBlockReason } from "@/lib/proofEvidence";
import { codAmountDueMinor, dropoffLabel, isCodCollected, isCodOrder } from "@/lib/riderOrder";
import { useTripProof } from "@/store/tripProof";

const OTP_LENGTH = 4;

/**
 * Delivery proof at the door — the hard gate.
 *
 * A delivery is not complete until the server holds a file. The confirm button
 * stays disabled, with the reason underneath it, until the upload comes back
 * stored. A photo is the default; a signature is accepted when the camera
 * cannot run, because a denied permission must not strand a rider holding
 * someone's paid print job.
 */
export default function DeliveryProofScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === "string" ? orderId : null;
  const { order, loading, error: loadError } = useTripOrder(id);

  const { getDraft, saveDraft, clearDraft, hydrated, hydrate } = useTripProof();
  const [otp, setOtp] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [storage, setStorage] = useState<"available" | "unavailable" | "unknown">("unknown");

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated || !id || restored) return;
    const draft = getDraft(id, "delivery");
    if (draft?.otp) setOtp(draft.otp);
    if (draft?.receivedBy) setReceivedBy(draft.receivedBy);
    setRestored(true);
  }, [hydrated, id, restored, getDraft]);

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
  });

  const codOutstanding = order ? isCodOrder(order) && !isCodCollected(order) : false;

  const blocked = !order
    ? "Loading the job."
    : codOutstanding
      ? `Collect ${api.formatPhp(codAmountDueMinor(order))} in cash first. Delivery cannot be confirmed before the money is recorded.`
      : otp.length < OTP_LENGTH
        ? `Enter the ${OTP_LENGTH}-digit code the client gives you.`
        : evidenceBlockReason(
            evidence.evidence,
            evidence.upload,
            "Photograph the package at the door. If the camera will not open, capture a signature instead.",
          );

  async function confirmDelivery() {
    if (!order || blocked) return;
    setBusy(true);
    setSubmitError(null);
    const signedBy = receivedBy.trim();
    try {
      await api.submitProof(order.id, {
        kind: "delivery",
        otp,
        photoName: evidence.evidence?.fileName,
        note: [
          evidence.evidence?.kind === "signature"
            ? "Signature captured at the door"
            : "Photo captured at the door",
          signedBy ? `Received by ${signedBy}` : null,
        ]
          .filter(Boolean)
          .join(". "),
      });
      clearDraft(order.id, "delivery");
      router.back();
    } catch (e) {
      setSubmitError(
        api.apiErrorMessage(
          e,
          "The delivery was not recorded. Check the code with the client and try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="gg-screen" edges={["bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="gg-page gap-8 pb-10 pt-6"
          keyboardShouldPersistTaps="handled"
        >
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
              <TripStepHeader
                order={order}
                stopKind="dropoff"
                stopLabel={dropoffLabel(order)}
              />

              {codOutstanding ? (
                <InlineNotice
                  tone="warning"
                  icon="triangle-alert"
                  title={`${api.formatPhp(codAmountDueMinor(order))} still to collect`}
                  body="Take the cash and record it first. This delivery cannot be confirmed until the money is in."
                  actionLabel="Record the cash"
                  onAction={() =>
                    router.replace({
                      pathname: "/trip/cod",
                      params: { orderId: order.id },
                    })
                  }
                />
              ) : null}

              {storage === "unavailable" ? (
                <InlineNotice
                  tone="error"
                  icon="circle-x"
                  title="Photo storage is offline"
                  body="Evidence cannot reach the server, so this delivery cannot be proven yet. Tell Operations, and record a failed attempt if the client cannot wait."
                />
              ) : null}

              <OtpInput
                value={otp}
                onChange={(next) => {
                  setOtp(next);
                  if (id) saveDraft(id, "delivery", { otp: next });
                }}
                length={OTP_LENGTH}
                label="Delivery code"
                helper="Ask the person receiving the package for the code in their GRIDGO app."
                disabled={busy}
              />

              <EvidenceCapture
                title="Evidence at the door"
                instruction="Photograph the package with the door or gate number in frame."
                evidence={evidence.evidence}
                upload={evidence.upload}
                captureError={evidence.captureError}
                cameraBlocked={evidence.cameraBlocked}
                onTakePhoto={() => void evidence.takePhoto()}
                onRetry={evidence.retry}
                onClear={evidence.clear}
                onSignature={evidence.attachSignature}
                disabled={busy}
              />

              {evidence.evidence?.kind === "signature" ? (
                <View className="gap-2">
                  <Text className="text-overline text-text-muted">RECEIVED BY</Text>
                  <TextInput
                    value={receivedBy}
                    onChangeText={(next) => {
                      setReceivedBy(next);
                      if (id) saveDraft(id, "delivery", { receivedBy: next });
                    }}
                    placeholder="Name of the person who signed"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="words"
                    className="gg-field"
                    accessibilityLabel="Name of the person who signed"
                  />
                  <Text className="text-caption text-text-muted">
                    Optional, but a signature with a name settles a dispute much faster.
                  </Text>
                </View>
              ) : null}

              {submitError ? (
                <InlineNotice
                  tone="error"
                  icon="circle-x"
                  title="Delivery not recorded"
                  body={submitError}
                />
              ) : null}

              <View className="gap-3">
                <PrimaryButton
                  label={busy ? "Recording…" : "Confirm delivery"}
                  onPress={() => void confirmDelivery()}
                  disabled={busy || Boolean(blocked)}
                  size="large"
                />
                {blocked ? (
                  <Text className="text-center text-body text-text-secondary">{blocked}</Text>
                ) : null}
                <SecondaryButton
                  label="Nobody can take it — report a failed attempt"
                  onPress={() =>
                    router.replace({
                      pathname: "/trip/failed",
                      params: { orderId: order.id },
                    })
                  }
                  disabled={busy}
                />
              </View>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
