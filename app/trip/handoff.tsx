import { useLocalSearchParams, useRouter } from "expo-router";
import { Eraser } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";

import { BlockingOverlay } from "@/components/BlockingOverlay";
import { FormScroll } from "@/components/FormScroll";
import { InlineNotice } from "@/components/InlineNotice";
import { PassedChecksSummary } from "@/components/PassedChecksSummary";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import { HandoffSkeleton } from "@/components/SkeletonScreens";
import { StatusChip } from "@/components/StatusChip";
import { StickyActionBar } from "@/components/StickyActionBar";
import { TextField } from "@/components/TextField";
import { TripStepHeader } from "@/components/TripStepHeader";
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
import { allPassed, canRunPickupChecks, toChecklistPayload } from "@/lib/pickupChecklist";
import { type EvidenceUpload, UPLOAD_IDLE, uploadStatusLine } from "@/lib/proofEvidence";
import { handoffSignatureEvidence } from "@/lib/proofPhoto";
import { pickupLabel } from "@/lib/riderOrder";
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
 * which shop, the six they just ran. From "Supplier signs here" down it is the
 * signer's: their name, the paper, and the sentence they are agreeing to with
 * the numbers in it, so the signature is over a claim rather than a blank.
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
  const { order, loading, error: loadError } = useTripOrder(id);
  const setActiveOrder = useActiveTrip((s) => s.setOrder);
  const rider = useSession((s) => s.user);

  const { getChecklist, saveSignature, clearChecklist, hydrated, hydrate } = useTripProof();
  const draft = id ? getChecklist(id) : null;

  const padRef = useRef<SignaturePadHandle>(null);
  const [signerName, setSignerName] = useState("");
  const [signed, setSigned] = useState(false);
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
  const [submitError, setSubmitError] = useState<string | null>(null);
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
    setSignerName(signature?.signerName || defaultSignerName(order));
    setRestoredFor(id);
  }

  const answers = draft?.answers ?? null;
  const storedFileId = draft?.signature?.storedFileId ?? null;
  const checkedAt = formatCheckedAt(draft?.completedAt ?? null, openedAtMs);
  const status = uploadStatusLine(upload, "signature");

  // A wide strip of paper, like the line on a form: full width, about two to
  // one, bounded so a tablet does not offer a whole page and a small phone
  // still gives room for a real signature.
  const padHeight = Math.min(260, Math.max(180, Math.round((windowWidth - 32) * 0.5)));

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
      const result = await api.submitPickupChecklist(order.id, toChecklistPayload(answers), {
        signature: { fileId, signerName: signerName.trim() },
      });
      setActiveOrder(result.order);
      clearChecklist(order.id);
      // Custody has moved. The trip screen carries the spoken line for as long
      // as it is owed, so this screen has nothing left to say.
      router.back();
    } catch (e) {
      // The upload reports its own failure through the status line; only a
      // refusal of the checks needs a sentence here.
      if (uploadRef.current.phase !== "failed") {
        if (api.apiErrorCode(e) === "invalid_handoff_signature" && order) {
          saveSignature(order.id, { storedFileId: null });
        }
        setSubmitError(
          api.apiErrorMessage(
            e,
            "The handoff was not recorded. Do not take the package until it is — try again.",
          ),
        );
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const ready = Boolean(order && answers && allPassed(answers));

  return (
    <Screen edges={["bottom"]}>
      <FormScroll contentClassName="gg-page gap-6 pb-8 pt-6" stickyActionHeight={actionBarHeight}>
        {loading ? <HandoffSkeleton /> : null}

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

        {order && restored && !ready ? (
          <InlineNotice
            tone="warning"
            icon="triangle-alert"
            title="The six checks come first"
            body="The supplier signs for checks that passed. Run all six together at the counter, then come back here."
            actionLabel="Open the pickup checks"
            onAction={() =>
              router.replace({ pathname: "/trip/pickup", params: { orderId: order.id } })
            }
          />
        ) : null}

        {order && ready ? (
          <>
            <TripStepHeader order={order} stopKind="pickup" stopLabel={pickupLabel(order)} />

            <PassedChecksSummary checkedAt={checkedAt} />

            <View className="gap-1">
              <Text className="text-h2 text-text-primary">Supplier signs here</Text>
              <Text className="text-body-lg text-text-secondary">
                {shopDisplayName(order)} hands this job to {rider?.name?.trim() || "the GRIDGO rider"}.
              </Text>
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
                hint="Turn the phone to the supplier and ask them to sign on the line."
                accessibilityHint="Draw the supplier's signature with your finger"
              />

              <View className="flex-row items-center justify-between gap-3">
                {status ? (
                  <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
                ) : (
                  <View />
                )}
                <Pressable
                  onPress={clearPad}
                  disabled={busy || !signed}
                  accessibilityRole="button"
                  accessibilityLabel="Clear the signature"
                  accessibilityState={{ disabled: busy || !signed }}
                  className={
                    busy || !signed
                      ? "min-h-11 flex-row items-center gap-2 px-2 opacity-40"
                      : "min-h-11 flex-row items-center gap-2 px-2"
                  }
                  style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
                >
                  <Eraser size={16} color={colors.textSecondary} strokeWidth={2} />
                  <Text className="text-button text-text-secondary">Clear</Text>
                </Pressable>
              </View>

              {status?.detail && status.tone === "error" ? (
                <Text className="text-body text-error">{status.detail}</Text>
              ) : null}
            </View>

            <Text className="text-body text-text-secondary">
              {attestationLine({
                signerName,
                order,
                riderName: rider?.name ?? null,
                checkedAt: draft?.completedAt ?? null,
                nowMs: openedAtMs,
              })}
            </Text>

            {submitError ? (
              <InlineNotice
                tone="error"
                icon="circle-x"
                title="Handoff not recorded"
                body={submitError}
              />
            ) : null}
          </>
        ) : null}
      </FormScroll>

      {order && ready ? (
        <StickyActionBar onHeight={setActionBarHeight}>
          <PrimaryButton
            label={handoffActionLabel({ busy, signed: signed || Boolean(storedFileId) })}
            onPress={() => void submit()}
            disabled={busy || Boolean(blocked)}
            size="large"
          />
          {blocked ? (
            <Text className="text-center text-body text-text-secondary">{blocked}</Text>
          ) : (
            <Text className="text-center text-body text-text-secondary">
              GRIDGO records the six checks and the signature together. The package becomes yours to carry.
            </Text>
          )}
        </StickyActionBar>
      ) : null}

      <BlockingOverlay visible={busy} label="Recording the handoff…" />
    </Screen>
  );
}
