import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text } from "react-native";

import { BlockingOverlay } from "@/components/BlockingOverlay";
import { EvidenceCapture } from "@/components/EvidenceCapture";
import { FormScroll } from "@/components/FormScroll";
import { SecondaryButton } from "@/components/SecondaryButton";
import { HandoverCodeCard } from "@/components/HandoverCodeCard";
import { InlineNotice } from "@/components/InlineNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ReceiptReminder } from "@/components/ReceiptReminder";
import { Screen } from "@/components/Screen";
import { ProofStepSkeleton } from "@/components/SkeletonScreens";
import { StickyActionBar } from "@/components/StickyActionBar";
import { TripStepHeader } from "@/components/TripStepHeader";
import { useHandoverCode } from "@/hooks/useHandoverCode";
import { useProofEvidence } from "@/hooks/useProofEvidence";
import { useTripOrder } from "@/hooks/useTripOrder";
import * as api from "@/lib/api";
import { DELIVERY_TARGETS } from "@/lib/attachments";
import {
  HANDOVER_ESCALATION_REASON,
  handoverBlockReason,
  handoverRefusal,
  riderChecksHandoverCode,
  type HandoverRefusal,
} from "@/lib/handoverCode";
import { evidenceBlockReason } from "@/lib/proofEvidence";
import {
  dropoffLabel,
  endsAtOffice,
  isBalanceConfirmed,
  owesAcknowledgementReceipt,
} from "@/lib/riderOrder";
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
 * No money is handled here and none is shown. On a delivery the client's
 * balance must be confirmed by Operations or not required because the order
 * was paid in full — a status the rider needs, not an amount.
 *
 * A collected job is the other shape entirely: the far end is GRIDGO's own
 * counter, so there is nobody to hand it to and nothing to be paid. Holding a
 * rider there against the client's balance stranded them at our office waiting
 * on something no one present could do. The screen drops the money out of it
 * and asks only for proof the package reached the shelf.
 *
 * At a client's door the rider also hands over an acknowledgement receipt —
 * the pilot's only receipt. Its tick is the rider's own reminder: it stays on
 * this phone and never holds the confirm button, because it is not a server delivery gate.
 *
 * The client reads their code aloud and the rider types it. Only the server
 * verifies it, together with the evidence. A job with no requirement delivers
 * with evidence alone; GRIDGO Office never asks the rider for a client code.
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
  const [receiptHandedOver, setReceiptHandedOver] = useState(false);
  const [otp, setOtp] = useState("");
  const [refusal, setRefusal] = useState<HandoverRefusal | null>(null);
  const [actionBarHeight, setActionBarHeight] = useState(0);
  const [escalated, setEscalated] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [escalateError, setEscalateError] = useState<string | null>(null);

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

  const toOffice = order ? endsAtOffice(order) : false;
  const balanceHeld = order ? !toOffice && !isBalanceConfirmed(order) : false;
  const evidenceFileId = evidence.stored.delivery_photo ?? null;

  const handover = useHandoverCode(order && riderChecksHandoverCode(order) ? order.id : null);
  const codeBlock = refusal?.message ?? handoverBlockReason(handover.load, otp);
  const codeHeld = refusal !== null;

  useEffect(() => {
    if (refusal?.kind !== "locked" || refusal.retryAtMs === null) return;
    const retryAtMs = refusal.retryAtMs;
    const timer = setInterval(() => {
      if (Date.now() >= retryAtMs) setRefusal(null);
    }, 1000);
    return () => clearInterval(timer);
  }, [refusal]);

  const [previousId, setPreviousId] = useState(id);
  if (previousId !== id) {
    setPreviousId(id);
    setOtp("");
    setRefusal(null);
    setEscalated(false);
    setEscalateError(null);
    setSubmitError(null);
  }

  const blocked = !order
    ? "Loading the job."
    : balanceHeld
      ? "Operations has not confirmed the client's balance due. Call them before you hand the package over."
      : codeBlock ?? evidenceBlockReason(
          evidence.evidence,
          evidence.upload,
          toOffice
            ? "Photograph the package where you left it at the office. If the camera will not open, capture a signature instead."
            : "Photograph the package at the door. If the camera will not open, capture a signature instead.",
        );

  async function confirmDelivery() {
    if (!order || busy || escalating || blocked || !evidenceFileId) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const updated = await api.recordDelivery(order.id, {
        evidenceFileId,
        evidenceType: evidence.evidence?.kind === "signature" ? "signature" : "photo",
        ...(handover.load.status === "ready" ? { otp } : {}),
      });
      setActiveOrder(updated);
      router.back();
    } catch (e) {
      const codeRefusal = handoverRefusal(e);
      if (codeRefusal) {
        setRefusal(codeRefusal);
        setOtp("");
        return;
      }
      setSubmitError(
        api.apiErrorMessage(
          e,
          toOffice
            ? "The drop-off was not recorded. Do not leave until it shows as recorded — try again."
            : "The delivery was not recorded. Do not leave until it shows as recorded — try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function escalateMismatch() {
    if (!order || busy || escalating || escalated) return;
    setEscalating(true);
    setEscalateError(null);
    try {
      await api.escalateHandover(order.id, HANDOVER_ESCALATION_REASON);
      setEscalated(true);
    } catch (e) {
      setEscalateError(
        api.apiErrorMessage(
          e,
          "Keep the package with you, check your connection and try again — or call Operations.",
        ),
      );
    } finally {
      setEscalating(false);
    }
  }

  function changeCode(value: string) {
    setOtp(value);
    if (refusal?.kind === "mismatch") setRefusal(null);
    setSubmitError(null);
  }

  return (
    <Screen edges={["bottom"]}>
      <FormScroll contentClassName="gg-page gap-8 pb-8 pt-6" stickyActionHeight={actionBarHeight}>
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
                title="The client's balance is not confirmed yet"
                body="GRIDGO cannot close a delivery with a balance due until Operations has confirmed it. Do not hand the package over — call Operations, and check again once they have."
                actionLabel="Check again"
                onAction={() => void reload()}
              />
            ) : null}

            {handover.load.status === "ready" ? (
              <HandoverCodeCard
                otp={otp}
                onChange={changeCode}
                disabled={busy || escalating}
              />
            ) : null}

            {handover.load.status === "error" ? (
              <InlineNotice
                tone="error"
                icon="circle-x"
                title="The handover requirement did not load"
                body={`${handover.load.message} Do not hand the package over until the requirement loads.`}
                actionLabel="Try again"
                onAction={() => void handover.retry()}
              />
            ) : null}

            {refusal ? (
              <InlineNotice
                tone="error"
                icon={refusal.kind === "locked" ? "clock" : "circle-x"}
                title={refusal.kind === "locked" ? "Code check locked" : "That code does not match"}
                body={`${refusal.message} Keep the package with you. Ask the client to read the code again, or escalate to Operations.`}
              />
            ) : null}

            {escalated ? (
              <InlineNotice
                tone="warning"
                icon="clock"
                title="Operations has been alerted"
                body="Keep the package with you and stay near the drop-off point. Operations will call you or send an alert here. Escalation does not verify the code or complete delivery."
              />
            ) : null}

            {handover.load.status === "ready" && !escalated ? (
              <SecondaryButton
                label={escalating ? "Alerting Operations…" : "Escalate to Operations"}
                onPress={() => void escalateMismatch()}
                disabled={busy || escalating}
              />
            ) : null}

            {escalateError ? (
              <InlineNotice
                tone="error"
                icon="circle-x"
                title="Operations was not alerted"
                body={escalateError}
              />
            ) : null}

            {storage === "unavailable" ? (
              <InlineNotice
                tone="error"
                icon="circle-x"
                title="Photo storage is offline"
                body={
                  toOffice
                    ? "Evidence cannot reach the server, so this drop-off cannot be proven yet. Do not leave the package — tell Operations."
                    : "Evidence cannot reach the server, so this delivery cannot be proven yet. Do not hand the package over — tell Operations."
                }
              />
            ) : null}

            <EvidenceCapture
              title={toOffice ? "Evidence at the office" : "Evidence at the door"}
              instruction={
                toOffice
                  ? "Photograph the package where you leave it, with the shelf or counter in frame. It is both your proof the job reached GRIDGO Office and the supplier's proof the job was fulfilled."
                  : "Photograph the package with the door or gate number in frame. It is both your proof of handover and the supplier's proof the job was fulfilled."
              }
              evidence={evidence.evidence}
              upload={evidence.upload}
              captureError={evidence.captureError}
              cameraBlocked={evidence.cameraBlocked}
              onTakePhoto={() => void evidence.takePhoto()}
              onRetry={evidence.retry}
              onClear={evidence.clear}
              onSignature={evidence.attachSignature}
              disabled={busy || balanceHeld || codeHeld}
            />

            {/* Hidden while the balance holds the package: the rider has just
                been told not to hand anything over. */}
            {owesAcknowledgementReceipt(order) && !balanceHeld && !codeHeld ? (
              <ReceiptReminder
                handedOver={receiptHandedOver}
                onToggle={() => setReceiptHandedOver((v) => !v)}
                disabled={busy}
              />
            ) : null}

            {submitError ? (
              <InlineNotice
                tone="error"
                icon="circle-x"
                title={toOffice ? "Drop-off not recorded" : "Delivery not recorded"}
                body={submitError}
              />
            ) : null}
          </>
        ) : null}
      </FormScroll>

      {order ? (
        <StickyActionBar onHeight={setActionBarHeight}>
          <PrimaryButton
            label={
              busy ? "Recording…" : toOffice ? "Confirm drop-off" : "Confirm delivery"
            }
            onPress={() => void confirmDelivery()}
            disabled={busy || escalating || Boolean(blocked)}
            size="large"
          />
          {blocked ? (
            <Text className="text-center text-body text-text-secondary">{blocked}</Text>
          ) : null}
        </StickyActionBar>
      ) : null}

      <BlockingOverlay
        visible={busy || escalating}
        label={
          escalating
            ? "Alerting Operations…"
            : toOffice
              ? "Recording the drop-off…"
              : "Recording the delivery…"
        }
      />
    </Screen>
  );
}
