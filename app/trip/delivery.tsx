import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, View } from "react-native";

import { BlockingOverlay } from "@/components/BlockingOverlay";
import { ExactCash } from "@/components/CashSlip";
import { CheckboxRow } from "@/components/CheckboxRow";
import { DeliveryPinDetails } from "@/components/DeliveryPinDetails";
import { EvidenceCapture } from "@/components/EvidenceCapture";
import { FormScroll } from "@/components/FormScroll";
import { BackupReceiverRow } from "@/components/BackupReceiverRow";
import { GroupOrderTag } from "@/components/GroupOrderTag";
import { HandoffReminderCard } from "@/components/HandoffReminderCard";
import { SecondaryButton } from "@/components/SecondaryButton";
import { HandoverCodePrompt, HandoverCodeRow } from "@/components/HandoverCodePrompt";
import { InlineNotice } from "@/components/InlineNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ReceiptReminder } from "@/components/ReceiptReminder";
import { ReceiptSignature } from "@/components/ReceiptSignature";
import type { SignaturePadHandle } from "@/components/SignaturePad";
import { Screen } from "@/components/Screen";
import { ProofStepSkeleton } from "@/components/SkeletonScreens";
import { StickyActionBar, StickyActionFallback } from "@/components/StickyActionBar";
import { TripStepHeader } from "@/components/TripStepHeader";
import { UpdateRequiredPanel } from "@/components/UpdateRequired";
import { tripDestination } from "@/lib/tripNav";
import { useAcknowledgementReceipt } from "@/hooks/useAcknowledgementReceipt";
import { useHandoverCode } from "@/hooks/useHandoverCode";
import { useGroupBackup } from "@/hooks/useGroupBackup";
import { useCashNoShowRecord } from "@/hooks/useCashNoShowRecord";
import { useOrderCash } from "@/hooks/useOrderCash";
import { useProofEvidence } from "@/hooks/useProofEvidence";
import { useRefusalAction } from "@/hooks/useRefusalAction";
import { useTripOrder } from "@/hooks/useTripOrder";
import { useCustodyNeedsUpdate } from "@/hooks/useUpdateRequired";
import { receiptDeliveryHold, receiptStage } from "@/lib/acknowledgementReceipt";
import * as api from "@/lib/api";
import { DELIVERY_TARGETS, PACKAGE_PHOTO_TARGETS, RECEIPT_SIGNATURE_TARGETS, uploadEvidence } from "@/lib/attachments";
import {
  handoffReminderBlockReason,
  handoffReminderFields,
  isPackagePhotoRefusal,
  packagePhotoUnfinished,
} from "@/lib/handoffReminder";
import {
  HANDOVER_ESCALATION_REASON,
  handoverBlockReason,
  handoverPromptDue,
  handoverRefusal,
  riderChecksHandoverCode,
  type HandoverRefusal,
} from "@/lib/handoverCode";
import { evidenceBlockReason, UPLOAD_IDLE, type EvidenceUpload } from "@/lib/proofEvidence";
import { receiptSignatureEvidence } from "@/lib/proofPhoto";
import { receiptSignatureBlockReason, signatureFileRefused } from "@/lib/receiptSignature";
import {
  endsAtOffice,
  isBalanceConfirmed,
  owesAcknowledgementReceipt,
} from "@/lib/riderOrder";
import { riderRefusal, type RiderRefusal } from "@/lib/riderRefusals";
import { cashAmountsOf, isCashOrder, newIdempotencyKey } from "@/lib/cash";
import { groupOrderOf, receiverWord } from "@/lib/groupOrder";
import { useActiveTrip } from "@/store/activeTrip";

const FILL = { flex: 1 } as const;
const HIDDEN = { display: "none" } as const;

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
 * No money is handled here. On a delivery the client's balance must be
 * confirmed by Operations or not required because the order was paid in full —
 * a status the rider needs, not an amount.
 *
 * A collected job is the other shape entirely: the far end is GRIDGO's own
 * counter, so there is nobody to hand it to and nothing to be paid. Holding a
 * rider there against the client's balance stranded them at our office waiting
 * on something no one present could do. The screen drops the money out of it
 * and asks only for proof the package reached the shelf.
 *
 * At a client's door the rider also hands over an acknowledgement receipt —
 * the pilot's only receipt. Once they record arrival, GRIDGO's issued receipt
 * opens in that card for them to copy onto paper: the only client amounts a
 * rider ever sees, and only while this handover is on screen
 * (`useAcknowledgementReceipt`). On a server that issues receipts the confirm
 * button waits for one (`receiptDeliveryHold`): the server would issue it
 * inside the delivery anyway, but then close it before its number reached the
 * paper. The tick never holds anything.
 *
 * The client reads their code aloud and the rider types it. Only the server
 * verifies it, together with the evidence. A job with no requirement delivers
 * with evidence alone; GRIDGO Office never asks the rider for a client code.
 *
 * Once the door photo is taken, the reminder card asks the rider to thank the
 * client and ask for a rating and a share (`lib/handoffReminder.ts`). Its tick
 * is required to close a door delivery; the client-agreed package photo is
 * optional. A refusal of that photo removes it and keeps the door photo, so
 * the rider confirms again without retaking anything.
 *
 * A cash job adds one step before the receipt (gridgo-api
 * `docs/CASH_ON_DELIVERY_API.md`, step 3): the door photo first, then the
 * client's exact cash, ticked as received and recorded with
 * `POST /dispatch/:id/cash/collect`. That call issues the receipt marked Cash,
 * which the client then signs as on any job. Collection and the signed
 * handover are two facts: recording the cash never fakes a signature, and the
 * delivery still needs one. If the client is not there or will not pay, the
 * no-show screen takes over (`/trip/no-show`).
 */
export default function DeliveryProofScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === "string" ? orderId : null;
  const { order, setOrder, loading, error: loadError, reload } = useTripOrder(id);
  // A step this build is too old for shows the update; the trip stays as it is.
  const needsUpdate = useCustodyNeedsUpdate(order);
  const setActiveOrder = useActiveTrip((s) => s.setOrder);

  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<RiderRefusal | null>(null);
  const refusalAction = useRefusalAction(id, "delivery");
  const [storage, setStorage] = useState<"available" | "unavailable" | "unknown">("unknown");
  const [receiptHandedOver, setReceiptHandedOver] = useState(false);
  const [otp, setOtp] = useState("");
  const [refusal, setRefusal] = useState<HandoverRefusal | null>(null);
  const [actionBarHeight, setActionBarHeight] = useState(0);
  const [escalated, setEscalated] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [escalateError, setEscalateError] = useState<string | null>(null);
  const [reminded, setReminded] = useState(false);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptOpenedFor, setPromptOpenedFor] = useState<string | null>(null);
  // The receiving person's signature on the digital receipt. In memory only:
  // it belongs to this handover and nothing else.
  const padRef = useRef<SignaturePadHandle>(null);
  const [signerName, setSignerName] = useState("");
  const [signed, setSigned] = useState(false);
  const [inked, setInked] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [signatureUpload, setSignatureUpload] = useState<EvidenceUpload>(UPLOAD_IDLE);
  const [signatureFileId, setSignatureFileId] = useState<string | null>(null);
  // Cash at the door: the rider's tick, and one key per collection or delivery body.
  const [cashReceived, setCashReceived] = useState(false);
  // The first collection request, kept whole: a retry after a lost reply must send
  // the same body under the same key, or the server refuses it as a conflict.
  const [collectAttempt, setCollectAttempt] = useState<{
    body: { expectedVersion: number; amountReceivedMinor: number; evidenceFileId: string };
    key: string;
  } | null>(null);
  const [deliveryKey, setDeliveryKey] = useState<{ body: string; key: string } | null>(null);

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

  const packagePhoto = useProofEvidence({
    orderId: id ?? "",
    step: "package",
    targets: PACKAGE_PHOTO_TARGETS,
  });

  const uploadRefusal = refusalAction(
    evidence.upload.phase === "failed" ? riderRefusal(evidence.upload.code) : null,
  );

  const toOffice = order ? endsAtOffice(order) : false;
  const balanceHeld = order ? !toOffice && !isBalanceConfirmed(order) : false;
  const evidenceFileId = evidence.stored.delivery_photo ?? null;

  const handover = useHandoverCode(order && riderChecksHandoverCode(order) ? order.id : null);
  const codeBlock = refusal?.message ?? handoverBlockReason(handover.load, otp);
  const codeHeld = refusal !== null;
  const codeComplete = /^\d{6}$/.test(otp);
  // Group order: the host receives, and a backup only once the server opens it.
  const group = groupOrderOf(order);
  const who = receiverWord(order);
  const backup = useGroupBackup(order);

  // The full-screen code prompt opens by itself once per job, when the rider
  // arrives at the drop-off; after that only the rider or a refusal opens it.
  const promptDue = order ? handoverPromptDue(handover.load, receiptStage(order)) : false;
  if (promptDue && id && promptOpenedFor !== id) {
    setPromptOpenedFor(id);
    setPromptOpen(true);
  }
  const promptShown = promptOpen && handover.load.status === "ready";

  // Android's back closes the prompt rather than leaving the delivery step.
  useEffect(() => {
    if (!promptShown) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setPromptOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [promptShown]);

  useEffect(() => {
    if (refusal?.kind !== "locked" || refusal.retryAtMs === null) return;
    const retryAtMs = refusal.retryAtMs;
    const timer = setInterval(() => {
      if (Date.now() >= retryAtMs) setRefusal(null);
    }, 1000);
    return () => clearInterval(timer);
  }, [refusal]);

  const adoptOrder = useCallback(
    (next: api.Order) => {
      setOrder(next);
      setActiveOrder(next);
    },
    [setOrder, setActiveOrder],
  );
  const verifyOrder = useCallback(() => reload("refresh"), [reload]);
  const reopenOrder = useCallback(() => void reload("refresh"), [reload]);
  // Hidden while the balance or the code holds the package: the rider has just
  // been told not to hand anything over, so the receipt is not held either.
  const receiptCard = Boolean(order && owesAcknowledgementReceipt(order) && !balanceHeld && !codeHeld);
  const cashJob = order ? isCashOrder(order) : false;
  const amounts = cashAmountsOf(order);
  const orderCash = useOrderCash(cashJob ? order : null);
  const noShow = useCashNoShowRecord(cashJob ? id : null, order, orderCash.detail);
  const noShowReported = Boolean(cashJob && noShow?.reportedAtMs);
  const receipt = useAcknowledgementReceipt(receiptCard && !noShowReported ? order : null, {
    onOrder: adoptOrder,
    verify: verifyOrder,
    onClosed: reopenOrder,
    cash: cashJob,
    cashMark: cashJob ? `${order?.cash?.version ?? 0}|${orderCash.detail?.collectedAt ?? ""}` : null,
  });
  // Once the server has the collection, the collect action never shows again;
  // the receipt it issued is read back instead (`cashMark`).
  const collectedOnServer = Boolean(orderCash.detail?.collectedAt) || order?.cash?.status === "collected";
  const cashDue = cashJob && receipt.load.status === "cash_due" && !collectedOnServer;

  const [previousId, setPreviousId] = useState(id);
  if (previousId !== id) {
    setPreviousId(id);
    setOtp("");
    setRefusal(null);
    setEscalated(false);
    setEscalateError(null);
    setSubmitError(null);
    setReminded(false);
    setPhotoConsent(false);
    setPromptOpen(false);
    setSignerName("");
    setSigned(false);
    setInked(false);
    setSignatureUpload(UPLOAD_IDLE);
    setSignatureFileId(null);
    setCashReceived(false);
    setCollectAttempt(null);
    setDeliveryKey(null);
  }

  // The card follows the door photo: by then the package is in the client's
  // hands, which is when the lines are said.
  const reminderCard = Boolean(order && !toOffice && evidence.evidence);
  const reminderBlock = handoffReminderBlockReason({ toOffice, reminded });
  // Only an id the server confirmed is ever sent. A photo still sending, or
  // one that failed, never holds the job; the button says it closes without it.
  const packagePhotoFileId = packagePhoto.stored.delivery_package_photo ?? null;
  const withoutPackagePhoto =
    !toOffice &&
    packagePhotoUnfinished({ photoConsent, packageEvidence: packagePhoto.evidence, packagePhotoFileId });

  function changePhotoConsent(value: boolean) {
    setPhotoConsent(value);
    // Unticking withdraws the photo too; nothing the client declined is sent.
    if (!value) packagePhoto.clear();
  }

  // The map flow's door handover: the receipt is signed on screen and sent
  // with the delivery (`receiptMode: "digital"`). Paper stays for an API that
  // shows no receipt (`paper_only`, or a bare 404 on the route).
  const digitalReceipt = receiptCard && receipt.stage === "at_door" && receipt.load.status === "ready";
  const receiptArNumber = receipt.load.status === "ready" ? receipt.load.receipt.arNumber : null;

  function signatureChanged(nextInked: boolean) {
    setInked(nextInked);
    // New ink is a new signature; a file stored for the old one no longer stands.
    setSignatureFileId(null);
    setSignatureUpload(UPLOAD_IDLE);
    setSubmitError(null);
  }

  /** The PNG on the server and attached to this assignment, or the one already there. */
  async function storeReceiptSignature(orderIdToAttach: string): Promise<string> {
    if (signatureFileId) return signatureFileId;
    const uri = await padRef.current?.toPngFile();
    if (!uri) throw new Error("signature_pad_not_ready");
    const file = await receiptSignatureEvidence(uri);
    const handle = uploadEvidence({
      orderId: orderIdToAttach,
      evidence: file,
      targets: RECEIPT_SIGNATURE_TARGETS,
      onPhase: setSignatureUpload,
    });
    const stored = await handle.result;
    const fileId = stored.acknowledgement_signature;
    if (!fileId) throw new Error("signature_not_stored");
    setSignatureFileId(fileId);
    return fileId;
  }

  const collectBlocked = !cashDue
    ? null
    : !amounts || !orderCash.detail
      ? "Loading this job's cash amounts."
      : !evidenceFileId
        ? "Take the door photo first. It is GRIDGO's record of where you collected the cash."
        : !cashReceived
          ? `Count the ${who}'s cash, then tick that you received exactly ${api.formatPhp(amounts.collectMinor)}.`
          : null;

  async function collectCash() {
    if (!order || !amounts || !orderCash.detail || !evidenceFileId || collectBlocked || busy) return;
    // The same door photo is the same intent: resend the first request exactly.
    const attempt =
      collectAttempt?.body.evidenceFileId === evidenceFileId
        ? collectAttempt
        : {
            body: { expectedVersion: orderCash.detail.version, amountReceivedMinor: amounts.collectMinor, evidenceFileId },
            key: newIdempotencyKey("collect"),
          };
    setCollectAttempt(attempt);
    setBusy(true);
    setSubmitError(null);
    try {
      await receipt.collect(attempt.body, attempt.key);
      void orderCash.reload();
    } catch (e) {
      const code = api.apiErrorCode(e);
      // A definite refusal recorded nothing, so the next tap is a new request.
      // No reply, or a server error, may have committed: keep the first body.
      if (e instanceof api.ApiError && e.status < 500) setCollectAttempt(null);
      // The server may already hold this collection: read the money record and the receipt again.
      if (code === "cash_stale" || code === "cash_idempotency_conflict" || code === "cash_collection_not_available") {
        void orderCash.reload();
        void receipt.retry();
      }
      setSubmitError(api.tripRefusal(e, "The cash was not recorded. Keep it with you and try again."));
    } finally {
      setBusy(false);
    }
  }

  const blocked = !order
    ? "Loading the job."
    : noShowReported
      ? "Your no-show report is with Operations. Take the package to GRIDGO Office."
      : balanceHeld
      ? "Operations has not confirmed the client's balance due. Call them before you hand the package over."
      : receiptDeliveryHold(receipt.stage, receipt.load) ?? codeBlock ?? evidenceBlockReason(
          evidence.evidence,
          evidence.upload,
          toOffice
            ? "Photograph the package where you left it at the office. If the camera will not open, capture a signature instead."
            : "Photograph the package at the door. If the camera will not open, capture a signature instead.",
        ) ?? (digitalReceipt
          ? receiptSignatureBlockReason({ signerName, signed, upload: signatureUpload })
          : null) ?? reminderBlock;

  async function confirmDelivery() {
    if (!order || busy || escalating || blocked || !evidenceFileId) return;
    setBusy(true);
    setSubmitError(null);
    // Drop unfinished optional work first, so a late upload cannot land on a
    // job that has already closed without it.
    if (withoutPackagePhoto) packagePhoto.clear();
    try {
      const signature =
        digitalReceipt && receiptArNumber
          ? {
              arNumber: receiptArNumber,
              fileId: await storeReceiptSignature(order.id),
              signerName: signerName.trim(),
            }
          : null;
      const body = {
        ...(signature ? { receiptMode: "digital" as const, acknowledgementSignature: signature } : {}),
        evidenceFileId,
        evidenceType: evidence.evidence?.kind === "signature" ? ("signature" as const) : ("photo" as const),
        ...(handover.load.status === "ready" ? { otp } : {}),
        ...handoffReminderFields({
          toOffice,
          reminded,
          photoConsent,
          packagePhotoFileId,
        }),
      };
      // A cash delivery settles money, so it carries a key; the same body keeps the same key.
      const bodyText = JSON.stringify(body);
      const key = cashJob ? (deliveryKey?.body === bodyText ? deliveryKey.key : newIdempotencyKey("delivery")) : undefined;
      if (key) setDeliveryKey({ body: bodyText, key });
      const updated = key ? await api.recordDelivery(order.id, body, key) : await api.recordDelivery(order.id, body);
      // Adopted here as well, so the receipt is gone before the screen is.
      adoptOrder(updated);
      router.back();
    } catch (e) {
      const codeRefusal = handoverRefusal(e);
      if (codeRefusal) {
        setRefusal(codeRefusal);
        setOtp("");
        // The client is still there: ask them to read it again, full screen.
        setPromptOpen(true);
        return;
      }
      if (isPackagePhotoRefusal(api.apiErrorCode(e))) packagePhoto.clear();
      if (signatureFileRefused(api.apiErrorCode(e))) setSignatureFileId(null);
      setSubmitError(
        api.tripRefusal(
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

  // Drawn in the prompt while it is open, on the delivery screen otherwise.
  const codeNotices = (
    <>
      {refusal ? (
        <InlineNotice
          tone="error"
          icon={refusal.kind === "locked" ? "clock" : "circle-x"}
          title={refusal.kind === "locked" ? "Code check locked" : "That code does not match"}
          body={`${refusal.detail ? `${refusal.detail} ` : ""}Keep the package with you. ${
            refusal.kind === "locked" ? "Wait until then" : `Ask the ${group ? "host or backup" : "client"} to read the code again`
          }, or escalate to Operations.`}
        />
      ) : null}

      {escalated ? (
        <InlineNotice
          tone="warning"
          icon="clock"
          title="Operations has been alerted"
          body="Keep the package and stay near the drop-off. Operations will call you or send an alert here. This does not complete the delivery."
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
    </>
  );

  const evidenceCard = (
      <EvidenceCapture
        key={id}
        title={toOffice ? "Evidence at the office" : "Evidence at the door"}
        purpose="GRIDGO keeps this with the job as the record that the package was handed over."
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
        failureAction={
          uploadRefusal.actionLabel && uploadRefusal.onAction
            ? { label: uploadRefusal.actionLabel, onPress: uploadRefusal.onAction }
            : null
        }
        disabled={busy || balanceHeld || codeHeld || noShowReported}
      />
  );

  // What to collect, inside the receipt card the Cash receipt then opens in.
  const cashCollection =
    cashDue && amounts ? (
      <View className="gap-4" testID="cash-collection">
        <ExactCash
          label={group ? "Collect from the host, for the whole group" : "Collect from the client, in cash"}
          minor={amounts.collectMinor}
          note={
            group
              ? `One cash payment covers all ${group.memberCount} people. Exactly this amount, from the host. Count it in front of them before you tick.`
              : "Exactly this amount. Count it in front of them before you tick."
          }
          testID="collect-cash-amount"
        />
        <CheckboxRow
          checked={cashReceived}
          onChange={setCashReceived}
          label={`I received exactly ${api.formatPhp(amounts.collectMinor)} in cash`}
          hint="GRIDGO then issues the receipt, marked Cash, for the client to sign."
          disabled={busy || !evidenceFileId}
          testID="cash-received-confirm"
        />
        <SecondaryButton
          label={group ? "Host not here or won't pay" : "Client not here or won't pay"}
          onPress={() => router.push({ pathname: "/trip/no-show", params: { orderId: order?.id ?? "" } })}
          disabled={busy}
        />
      </View>
    ) : null;

  if (needsUpdate) {
    return (
      <Screen edges={[]}>
        <UpdateRequiredPanel variant="step" />
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      {promptShown ? (
        <HandoverCodePrompt
          stickyActionHeight={actionBarHeight}
          otp={otp}
          onChange={changeCode}
          onClose={() => setPromptOpen(false)}
          disabled={busy || escalating}
          group={Boolean(group)}
        >
          {codeNotices}
        </HandoverCodePrompt>
      ) : null}

      {/* Hidden, not unmounted, under the prompt: nothing the rider has done here is lost. */}
      <View style={promptShown ? HIDDEN : FILL}>
        <FormScroll
          contentClassName="gg-page gap-8 pb-8 pt-6"
          stickyActionHeight={actionBarHeight}
          scrollEnabled={!drawing}
        >
          {loading ? <ProofStepSkeleton /> : null}

          {loadError ? (
            <InlineNotice
              tone="error"
              icon="circle-x"
              title="This job did not load"
              body={loadError}
            />
          ) : null}

          {order ? (
            <>
              <TripStepHeader order={order} stopKind="dropoff" stopLabel={tripDestination(order).label} navigate />

              {group ? (
                <View className="gap-3">
                  <GroupOrderTag order={order} />
                  <BackupReceiverRow order={order} load={backup.load} onRetry={() => void backup.refresh()} />
                </View>
              ) : null}

              {tripDestination(order).kind === "client" ? (
                <View className="gg-card">
                  <DeliveryPinDetails order={order} />
                </View>
              ) : null}

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

              {noShowReported ? (
                <InlineNotice
                  tone="warning"
                  icon="clock"
                  title="No-show reported"
                  body="Operations has your report. Take the package to GRIDGO Office. When they confirm it is back, the shop payment returns to your wallet."
                />
              ) : null}

              {cashJob && !noShowReported && receipt.stage === "at_door" ? evidenceCard : null}

              {receiptCard && !noShowReported ? (
                <ReceiptReminder
                  stage={receipt.stage}
                  load={receipt.load}
                  onRetry={() => void receipt.retry()}
                  onArrive={() => void receipt.arrive()}
                  arriving={receipt.arriving}
                  arrivalError={receipt.arrivalError}
                  handedOver={receiptHandedOver}
                  onToggle={() => setReceiptHandedOver((v) => !v)}
                  disabled={busy}
                  cashCollection={cashCollection}
                  signing={
                    <ReceiptSignature
                      padRef={padRef}
                      signerName={signerName}
                      onSignerName={setSignerName}
                      inked={inked}
                      onSignedChange={setSigned}
                      onInkChange={signatureChanged}
                      onDrawingChange={setDrawing}
                      upload={signatureUpload}
                      onClear={() => {
                        padRef.current?.clear();
                        signatureChanged(false);
                      }}
                      onUndo={() => {
                        padRef.current?.undo();
                        setSignatureFileId(null);
                        setSignatureUpload(UPLOAD_IDLE);
                      }}
                      disabled={busy}
                    />
                  }
                />
              ) : null}

              {handover.load.status === "ready" ? (
                <HandoverCodeRow otp={otp} onOpen={() => setPromptOpen(true)} group={Boolean(group)} />
              ) : null}

              {handover.load.status === "error" ? (
                <InlineNotice
                  tone="error"
                  icon="circle-x"
                  title="Could not check for a handover code"
                  body={`${handover.load.message} Keep the package until this loads.`}
                  actionLabel="Try again"
                  onAction={() => void handover.retry()}
                />
              ) : null}

              {promptShown ? null : codeNotices}

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

              {cashJob && (noShowReported || receipt.stage === "at_door") ? null : evidenceCard}

              {reminderCard ? (
                <HandoffReminderCard
                  reminded={reminded}
                  onReminded={setReminded}
                  photoConsent={photoConsent}
                  onPhotoConsent={changePhotoConsent}
                  packagePhoto={packagePhoto}
                  disabled={busy || balanceHeld || codeHeld}
                />
              ) : null}

              {submitError ? (
                <InlineNotice
                  tone="error"
                  icon="circle-x"
                  title={toOffice ? "Drop-off not recorded" : "Delivery not recorded"}
                  body={submitError.message}
                  {...refusalAction(submitError)}
                />
              ) : null}
            </>
          ) : null}
        </FormScroll>
      </View>

      <StickyActionBar
        onHeight={setActionBarHeight}
        note={promptShown ? (codeComplete ? null : codeBlock) : order ? (cashDue ? collectBlocked : blocked) : null}
      >
        {promptShown ? (
          <PrimaryButton
            label="Continue"
            onPress={() => setPromptOpen(false)}
            disabled={!codeComplete || busy || escalating}
            size="large"
          />
        ) : order && cashDue ? (
          <PrimaryButton
            label={busy ? "Recording…" : amounts ? `Record ${api.formatPhp(amounts.collectMinor)} received` : "Record cash received"}
            onPress={() => void collectCash()}
            disabled={busy || Boolean(collectBlocked)}
            size="large"
          />
        ) : order ? (
          <PrimaryButton
            label={
              busy
                ? "Recording…"
                : toOffice
                  ? "Confirm drop-off"
                  : withoutPackagePhoto
                    ? "Confirm delivery without the package photo"
                    : "Confirm delivery"
            }
            onPress={() => void confirmDelivery()}
            disabled={busy || escalating || Boolean(blocked)}
            size="large"
          />
        ) : (
          <StickyActionFallback loading={loading} onBack={() => router.back()} />
        )}
      </StickyActionBar>

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
