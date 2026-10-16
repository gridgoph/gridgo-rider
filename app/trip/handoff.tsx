import { useLocalSearchParams, useRouter } from "expo-router";
import { Eraser, Undo2 } from "lucide-react-native";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";

import { BlockingOverlay } from "@/components/BlockingOverlay";
import { FormScroll } from "@/components/FormScroll";
import { HandoverSteps } from "@/components/HandoverSteps";
import { InlineNotice } from "@/components/InlineNotice";
import { PassedChecksSummary } from "@/components/PassedChecksSummary";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { WhyWeAsk } from "@/components/legal/WhyWeAsk";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import { HandoffSkeleton } from "@/components/SkeletonScreens";
import { StatusChip } from "@/components/StatusChip";
import { StickyActionBar, StickyActionFallback } from "@/components/StickyActionBar";
import { TextField } from "@/components/TextField";
import { TripStepHeader } from "@/components/TripStepHeader";
import { useRefusalAction } from "@/hooks/useRefusalAction";
import { useThemeColors } from "@/hooks/useTheme";
import { useTripOrder } from "@/hooks/useTripOrder";
import * as api from "@/lib/api";
import { HANDOFF_SIGNATURE_TARGETS, uploadEvidence } from "@/lib/attachments";
import {
  attestationLine,
  defaultSignerName,
  formatCheckedAt,
  handoffActionLabel,
  handoffBlockReason,
  shopDisplayName,
} from "@/lib/handoffSignature";
import {
  allPassed,
  answersFromChecks,
  canRunPickupChecks,
  toChecklistPayload,
} from "@/lib/pickupChecklist";
import {
  countMode,
  draftCountLines,
  effectiveAnswers,
  recordedCountLines,
  toCountPayload,
} from "@/lib/pickupCount";
import { type EvidenceUpload, UPLOAD_IDLE, uploadStatusLine } from "@/lib/proofEvidence";
import { handoffSignatureEvidence } from "@/lib/proofPhoto";
import { pickupLabel } from "@/lib/riderOrder";
import type { RiderRefusal } from "@/lib/riderRefusals";
import { currentInspectionId, packedPhotoStored, ridersPack } from "@/lib/shopHandover";
import type { SignatureStroke } from "@/lib/signature";
import { useActiveTrip } from "@/store/activeTrip";
import { useSession } from "@/store/session";
import { useTripProof } from "@/store/tripProof";

/**
 * The supplier signs on the rider's phone.
 *
 * Six passes at the counter move nothing. The phone is turned round, the
 * person handing the job over signs for it, and only then does the server
 * record the checks and hand custody to the rider — the quality check, then
 * the signature, in that order, in one request. Nothing about this job is
 * recorded until "Done".
 *
 * The screen is written for two readers. The top is the rider's: which job,
 * which shop, the six they just ran and the pieces they counted. From "Supplier signs here" down it is the
 * signer's: their name, the paper, and the sentence they are agreeing to with
 * the numbers in it, so the signature is over a claim rather than a blank.
 *
 * On a `rider_packs` job the signature comes last of three (gridgo-api
 * `docs/SHOP_HANDOVER_API.md`): the server already holds the unpacked
 * inspection and the packed photo, so this screen reads the checks and counts
 * from the order rather than the draft, and `POST /dispatch/:id/pickup-confirm`
 * sends only the signature. A legacy job still sends checks, counts and
 * signature together.
 *
 * The strokes and the name are kept in the proof draft as they are made, so a
 * killed app comes back to the same paper. The upload is not: only a file id
 * the server has confirmed is remembered, and it is used again rather than
 * asking the supplier to sign twice because the network dropped between the
 * signature saving and the checks being sent.
 */
export default function HandoffSignatureScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { width: windowWidth } = useWindowDimensions();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === "string" ? orderId : null;
  const { order, loading, error: loadError, reload } = useTripOrder(id);
  const setActiveOrder = useActiveTrip((s) => s.setOrder);
  const rider = useSession((s) => s.user);

  const { getChecklist, saveSignature, clearChecklist, hydrated, hydrate } = useTripProof();
  const draft = id ? getChecklist(id) : null;

  const padRef = useRef<SignaturePadHandle>(null);
  const [signerName, setSignerName] = useState("");
  const [signed, setSigned] = useState(false);
  // Any ink at all, which is less than a signature: a stray dot can still be
  // taken back.
  const [inked, setInked] = useState(false);
  // A finger is on the paper; the page holds still under it.
  const [drawing, setDrawing] = useState(false);
  // Which job the draft was restored for; the pad's starting strokes with it.
  const [restoredFor, setRestoredFor] = useState<string | null>(null);
  const [initial, setInitial] = useState<{ strokes: SignatureStroke[]; width: number }>({
    strokes: [],
    width: 0,
  });
  // The clock the attestation reads "today" against, fixed when the screen opens.
  const [openedAtMs] = useState(() => Date.now());
  const [upload, setUpload] = useState<EvidenceUpload>(UPLOAD_IDLE);
  // The phase as of the last report, readable inside `submit` after awaits.
  const uploadRef = useRef<EvidenceUpload>(UPLOAD_IDLE);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [submitError, setSubmitError] = useState<RiderRefusal | null>(null);
  const refusalAction = useRefusalAction(id, "handoff");
  const [actionBarHeight, setActionBarHeight] = useState(0);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // The name and the paper come back after a restart, once per job, as soon
  // as both the draft and the order are in. Derived on render rather than in
  // an effect so the first frame with the order already carries them. The
  // name prefers what was typed, then whoever the shop profile says is at the
  // counter.
  const restored = Boolean(id) && restoredFor === id;
  if (hydrated && order && id && !restored) {
    const signature = getChecklist(id)?.signature;
    setInitial({ strokes: signature?.strokes ?? [], width: signature?.padWidth ?? 0 });
    setInked(Boolean(signature?.strokes?.length));
    setSignerName(signature?.signerName || defaultSignerName(order));
    setRestoredFor(id);
  }

  const mode = order ? countMode(order) : ({ kind: "legacy" } as const);
  const packs = order ? ridersPack(order) : false;
  const inspected = order ? Boolean(currentInspectionId(order)) : false;
  const packed = order ? packedPhotoStored(order) : false;
  // `rider_packs`: the server's inspection is what is signed for. Legacy: the
  // draft, with the count answering the quantity check against the order now.
  const answers = packs
    ? inspected
      ? answersFromChecks(order?.pickupChecklist?.checks)
      : null
    : draft
      ? effectiveAnswers(draft.answers, mode, draft.counts)
      : null;
  const countLines = packs
    ? order
      ? recordedCountLines(order)
      : null
    : mode.kind === "count"
      ? draftCountLines(mode.items, draft?.counts)
      : null;
  const storedFileId = draft?.signature?.storedFileId ?? null;
  const checkedAtIso = packs
    ? (order?.pickupChecklist?.completedAt ?? null)
    : (draft?.completedAt ?? null);
  const checkedAt = formatCheckedAt(checkedAtIso, openedAtMs);
  const status = uploadStatusLine(upload, "signature");

  // Room for a whole signature written with a finger, which is several times
  // larger than one written with a pen: full width and about five to three,
  // bounded so a tablet or a phone on its side does not offer a whole page.
  const padHeight = Math.min(300, Math.max(220, Math.round((windowWidth - 32) * 0.6)));

  const blocked = !order
    ? "Loading the job."
    : !canRunPickupChecks(order)
      ? "This job is not waiting for a signature. Return to the trip for its current step."
      : !restored
        ? "Restoring the signature…"
        : handoffBlockReason({ answers, signerName, signed, upload, storedFileId });

  function changeName(next: string) {
    setSignerName(next);
    if (id) saveSignature(id, { signerName: next });
  }

  function strokesChanged(strokes: SignatureStroke[], padWidth: number) {
    setInked(strokes.length > 0);
    // New ink means a new signature: a file stored for the old one no longer
    // stands for what is on the paper.
    if (id) saveSignature(id, { strokes, padWidth, storedFileId: null });
  }

  function reportUpload(phase: EvidenceUpload) {
    uploadRef.current = phase;
    setUpload(phase);
  }

  function clearPad() {
    padRef.current?.clear();
    reportUpload(UPLOAD_IDLE);
    setSubmitError(null);
  }

  function undoStroke() {
    padRef.current?.undo();
    reportUpload(UPLOAD_IDLE);
    setSubmitError(null);
  }

  /** The PNG on the server and attached to the job, or the id already there. */
  async function storeSignature(orderIdToAttach: string): Promise<string> {
    if (storedFileId) return storedFileId;
    const uri = await padRef.current?.toPngFile();
    if (!uri) throw new Error("signature_pad_not_ready");
    const file = await handoffSignatureEvidence(uri);
    const handle = uploadEvidence({
      orderId: orderIdToAttach,
      evidence: file,
      targets: HANDOFF_SIGNATURE_TARGETS,
      onPhase: reportUpload,
    });
    const stored = await handle.result;
    const fileId = stored.handoff_signature;
    if (!fileId) throw new Error("signature_not_stored");
    saveSignature(orderIdToAttach, { storedFileId: fileId });
    return fileId;
  }

  async function submit() {
    if (!order || !answers || blocked || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setSubmitError(null);
    try {
      const fileId = await storeSignature(order.id);
      const signature = { fileId, signerName: signerName.trim() };
      const result = packs
        ? await api.confirmPickup(order.id, signature)
        : await api.submitPickupChecklist(
            order.id,
            toChecklistPayload(answers),
            toCountPayload(mode, draft?.counts),
            { signature },
          );
      setActiveOrder(result.order);
      if (result.order.state !== "picked_up") {
        // A 200 is not custody. If the server recorded a failure instead, the
        // pickup screen is where the blocked receipt lives.
        if (result.order.pickupChecklist?.status === "failed_escalated") {
          clearChecklist(order.id);
          router.replace({ pathname: "/trip/pickup", params: { orderId: order.id } });
          return;
        }
        setSubmitError({
          message:
            "The handoff was not recorded. Do not take the package — pull down on the trip to refresh it, then try again.",
          step: "trip",
        });
        return;
      }
      clearChecklist(order.id);
      // Custody has moved. The trip screen carries the spoken line for as long
      // as it is owed, so this screen has nothing left to say.
      router.back();
    } catch (e) {
      const refusal = api.tripRefusal(
        e,
        "The handoff was not recorded. Do not take the package until it is — try again.",
      );
      if (api.apiErrorCode(e) === "invalid_handoff_signature" && order) {
        saveSignature(order.id, { storedFileId: null });
      }
      // A step the server says is missing: read the job again so the screen
      // shows which one, with the way back to it in the bar.
      if (refusal.step === "pickup" || refusal.step === "pack") {
        void reload("refresh");
      }
      // The upload reports its own failure through the status line; a refusal
      // that names a step to go back to still needs the way there.
      if (uploadRef.current.phase !== "failed" || refusal.step) {
        setSubmitError(refusal);
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const ready = packs
    ? Boolean(order && inspected && packed && answers && allPassed(answers))
    : Boolean(order && answers && allPassed(answers));
  // What a `rider_packs` job still needs before the shop can sign.
  const missingStep = packs && !ready ? (inspected ? "pack" : "check") : null;

  return (
    <Screen edges={[]}>
      <FormScroll
        contentClassName="gg-page gap-6 pb-8 pt-6"
        stickyActionHeight={actionBarHeight}
        scrollEnabled={!drawing}
      >
        {loading ? <HandoffSkeleton /> : null}

        {loadError ? (
          <InlineNotice
            tone="error"
            icon="circle-x"
            title="This job did not load"
            body={loadError}
          />
        ) : null}

        {order && restored && !ready && missingStep === "pack" ? (
          <InlineNotice
            tone="warning"
            icon="triangle-alert"
            title="Photograph the packed job first"
            body="The shop signs once the job is packed in front of you and the photo is saved. Take the packed photo, then come back here."
          />
        ) : order && restored && !ready && missingStep === "check" ? (
          <InlineNotice
            tone="warning"
            icon="triangle-alert"
            title="Check the items unpacked first"
            body="The shop signs for items you checked unpacked and watched being packed. Run all six checks together at the counter first."
          />
        ) : order && restored && !ready ? (
          <InlineNotice
            tone="warning"
            icon="triangle-alert"
            title="The six checks come first"
            body="The supplier signs for checks that passed. Run all six together at the counter, then come back here."
          />
        ) : null}

        {order && ready ? (
          <>
            <TripStepHeader order={order} stopKind="pickup" stopLabel={pickupLabel(order)} />

            {packs ? <HandoverSteps current="sign" /> : null}

            <PassedChecksSummary
              checkedAt={checkedAt}
              counts={countLines}
              flow={packs ? "rider_packs" : null}
            />

            <View className="gap-1">
              <Text className="text-h2 text-text-primary">Supplier signs here</Text>
              <Text className="text-body-lg text-text-secondary">
                {shopDisplayName(order)} hands this job to {rider?.name?.trim() || "the GRIDGO rider"}.
              </Text>
              <WhyWeAsk>
                {packs
                  ? "The name and signature are GRIDGO's record that the shop handed this job over after the unpacked check and the packing you watched."
                  : "The name and signature are GRIDGO's record that the shop handed this job over after the six checks."}
              </WhyWeAsk>
            </View>

            <View className="gap-2">
              <Text className="text-caption text-text-muted">Name of the person signing</Text>
              <TextField
                value={signerName}
                onChange={changeName}
                placeholder="Who is signing for the shop"
                accessibilityLabel="Name of the person signing for the shop"
                kind="name"
                editable={!busy}
              />
            </View>

            <View className="gap-2">
              <SignaturePad
                ref={padRef}
                height={padHeight}
                baseline
                initialStrokes={initial.strokes}
                initialWidth={initial.width}
                onSignedChange={setSigned}
                onStrokesChange={strokesChanged}
                onDrawingChange={setDrawing}
                hint="Turn the phone to the supplier and ask them to sign on the line."
                accessibilityHint="Draw the supplier's signature with your finger"
              />

              <View className="flex-row items-center justify-between gap-3">
                {status ? (
                  <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
                ) : (
                  <View />
                )}
                <View className="flex-row items-center gap-1">
                  <PadControl
                    label="Undo"
                    accessibilityLabel="Undo the last stroke"
                    icon={<Undo2 size={16} color={colors.textSecondary} strokeWidth={2} />}
                    onPress={undoStroke}
                    disabled={busy || !inked}
                  />
                  <PadControl
                    label="Clear"
                    accessibilityLabel="Clear the signature"
                    icon={<Eraser size={16} color={colors.textSecondary} strokeWidth={2} />}
                    onPress={clearPad}
                    disabled={busy || !inked}
                  />
                </View>
              </View>

              {status?.detail && status.tone === "error" && !submitError ? (
                <Text className="text-body text-error">{status.detail}</Text>
              ) : null}
            </View>

            <Text className="text-body text-text-secondary">
              {attestationLine({
                signerName,
                order,
                counts: countLines,
                riderName: rider?.name ?? null,
                checkedAt: checkedAtIso,
                packedInFront: packs,
                nowMs: openedAtMs,
              })}
            </Text>

            {submitError ? (
              <InlineNotice
                tone="error"
                icon="circle-x"
                title="Handoff not recorded"
                body={submitError.message}
                {...refusalAction(submitError)}
              />
            ) : null}
          </>
        ) : null}
      </FormScroll>

      <StickyActionBar
        onHeight={setActionBarHeight}
        note={
          order && ready
            ? (blocked ??
              (packs
                ? "GRIDGO records the signature with your check and the packed photo. The package becomes yours to carry."
                : "GRIDGO records the count, the six checks and the signature together. The package becomes yours to carry."))
            : null
        }
      >
        {order && ready ? (
          <PrimaryButton
            label={handoffActionLabel({ busy, signed: signed || Boolean(storedFileId) })}
            onPress={() => void submit()}
            disabled={busy || Boolean(blocked)}
            size="large"
          />
        ) : order && restored && missingStep === "pack" ? (
          <PrimaryButton
            label="Take the packed photo"
            onPress={() => router.replace({ pathname: "/trip/pack", params: { orderId: order.id } })}
            size="large"
          />
        ) : order && restored ? (
          <PrimaryButton
            label="Open the pickup checks"
            onPress={() =>
              router.replace({ pathname: "/trip/pickup", params: { orderId: order.id } })
            }
            size="large"
          />
        ) : (
          <StickyActionFallback loading={loading || Boolean(order)} onBack={() => router.back()} />
        )}
      </StickyActionBar>

      <BlockingOverlay visible={busy} label="Recording the handoff…" />
    </Screen>
  );
}

/** A quiet control under the pad: an icon and a word, never a button slab. */
function PadControl({
  label,
  accessibilityLabel,
  icon,
  onPress,
  disabled,
}: {
  label: string;
  accessibilityLabel: string;
  icon: ReactNode;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      className={
        disabled
          ? "min-h-11 flex-row items-center gap-2 px-2 opacity-40"
          : "min-h-11 flex-row items-center gap-2 px-2"
      }
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      {icon}
      <Text className="text-button text-text-secondary">{label}</Text>
    </Pressable>
  );
}
