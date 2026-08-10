import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { BlockingOverlay } from "@/components/BlockingOverlay";
import { EvidenceCapture } from "@/components/EvidenceCapture";
import { InlineNotice } from "@/components/InlineNotice";
import { PickupCheckRow } from "@/components/PickupCheckRow";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { PickupChecklistSkeleton } from "@/components/SkeletonScreens";
import { StickyActionBar } from "@/components/StickyActionBar";
import { TripStepHeader } from "@/components/TripStepHeader";
import { useProofEvidence } from "@/hooks/useProofEvidence";
import { useThemeColors } from "@/hooks/useTheme";
import { useTripOrder } from "@/hooks/useTripOrder";
import * as api from "@/lib/api";
import { PICKUP_FAILURE_TARGETS } from "@/lib/attachments";
import {
  allAnswered,
  allPassed,
  checklistActionLabel,
  checklistBlockReason,
  checklistConsequence,
  EMPTY_ANSWERS,
  PICKUP_CHECKS,
  toChecklistPayload,
  type ChecklistAnswers,
} from "@/lib/pickupChecklist";
import { pickupLabel } from "@/lib/riderOrder";
import { useActiveTrip } from "@/store/activeTrip";
import { useTripProof } from "@/store/tripProof";

/**
 * The six-point pickup check, at the supplier's counter.
 *
 * This is the screen that decides whether a package moves at all. Every check
 * has to be answered, and one problem stops the job: the package stays at the
 * shop, GRIDGO logs the fault against the supplier who caused it, and the
 * founder is put in the loop.
 *
 * The reason is on the screen, not just in the rules, because a rider under
 * time pressure needs to know why the app is being difficult: a defect that
 * leaves the shop unlogged stops being the supplier's problem and becomes
 * GRIDGO's, and that is what the Zero-Risk Reprint Guarantee costs when nobody
 * checks.
 */
export default function PickupChecklistScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === "string" ? orderId : null;
  const { order, loading, error: loadError } = useTripOrder(id);
  const setActiveOrder = useActiveTrip((s) => s.setOrder);

  const { getChecklist, answerCheck, saveFailureNote, clearChecklist, hydrated, hydrate } =
    useTripProof();

  const [answers, setAnswers] = useState<ChecklistAnswers>(() => ({ ...EMPTY_ANSWERS }));
  const [failureNote, setFailureNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Six answers half-given survive the app being killed at the counter.
  useEffect(() => {
    if (!hydrated || !id || restored) return;
    const draft = getChecklist(id);
    if (draft) {
      setAnswers(draft.answers);
      setFailureNote(draft.failureNote);
    }
    setRestored(true);
  }, [hydrated, id, restored, getChecklist]);

  const evidence = useProofEvidence({
    orderId: id ?? "",
    step: "pickup",
    targets: PICKUP_FAILURE_TARGETS,
  });

  const answered = allAnswered(answers);
  const passing = allPassed(answers);
  const failing = answered && !passing;
  const evidenceFileId = evidence.stored.delivery_photo ?? null;

  const blocked = !order
    ? "Loading the job."
    : checklistBlockReason(answers, {
        note: failureNote,
        evidenceStored: Boolean(evidenceFileId),
      });

  const consequence = checklistConsequence(answers);

  function answer(code: (typeof PICKUP_CHECKS)[number]["code"], passed: boolean) {
    setAnswers((current) => ({ ...current, [code]: passed }));
    if (id) answerCheck(id, code, passed);
  }

  async function submit() {
    if (!order || blocked) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const result = await api.submitPickupChecklist(
        order.id,
        toChecklistPayload(answers),
        passing || !evidenceFileId
          ? undefined
          : { failureNote: failureNote.trim(), evidenceFileIds: [evidenceFileId] },
      );
      setActiveOrder(result.order);
      clearChecklist(order.id);
      if (passing) {
        // The sign-off is the next step, not a confirmation of this one, so it
        // replaces this screen rather than stacking on it.
        router.replace({ pathname: "/trip/sign-off", params: { orderId: order.id } });
        return;
      }
      router.back();
    } catch (e) {
      setSubmitError(
        api.apiErrorMessage(
          e,
          "The checks were not recorded. Try again before the package leaves the counter.",
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
          contentContainerClassName="gg-page gap-6 pb-8 pt-6"
          keyboardShouldPersistTaps="handled"
        >
          {loading ? <PickupChecklistSkeleton /> : null}

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
              <TripStepHeader order={order} stopKind="pickup" stopLabel={pickupLabel(order)} />

              <Text className="text-body-lg text-text-secondary">
                Check all six before the package leaves the counter. A fault that rides away
                unlogged stops being the supplier&apos;s and becomes GRIDGO&apos;s — that is what
                the reprint guarantee costs when nobody looks.
              </Text>

              {order.pickupChecklist?.status === "escalation_resolved" ? (
                <InlineNotice
                  tone="info"
                  icon="info"
                  title="Operations has answered"
                  body="Run all six again on the batch in front of you now, not the one you saw before."
                />
              ) : null}

              <View className="gg-card-flush">
                {PICKUP_CHECKS.map((check, index) => (
                  <PickupCheckRow
                    key={check.code}
                    index={index}
                    check={check}
                    answer={answers[check.code]}
                    onAnswer={(passed) => answer(check.code, passed)}
                    disabled={busy}
                  />
                ))}
              </View>

              {failing ? (
                <>
                  <InlineNotice
                    tone="error"
                    icon="circle-x"
                    title="Do not transport this package"
                    body="Leave it at the shop. GRIDGO records the fault against the supplier and raises it with the founder — then tells you what to do next."
                  />

                  <EvidenceCapture
                    title="Photo of the problem"
                    instruction="Photograph the fault itself — the misprint, the tear, the short count on the counter."
                    evidence={evidence.evidence}
                    upload={evidence.upload}
                    captureError={evidence.captureError}
                    cameraBlocked={evidence.cameraBlocked}
                    onTakePhoto={() => void evidence.takePhoto()}
                    onRetry={evidence.retry}
                    onClear={evidence.clear}
                    disabled={busy}
                  />

                  <View className="gap-2">
                    <Text className="text-overline text-text-muted">WHAT IS WRONG</Text>
                    <TextInput
                      value={failureNote}
                      onChangeText={(next) => {
                        setFailureNote(next);
                        if (id) saveFailureNote(id, next);
                      }}
                      multiline
                      className="min-h-24 rounded-field border border-outline bg-surface px-3 py-3 text-body text-text-primary"
                      placeholder="Colour is off across the whole batch, first 40 pieces are smudged…"
                      placeholderTextColor={colors.textMuted}
                      accessibilityLabel="What is wrong with this package"
                    />
                    <Text className="text-caption text-text-muted">
                      Operations and the founder read this. Say what you can see, not what you
                      think caused it.
                    </Text>
                  </View>
                </>
              ) : null}

              {submitError ? (
                <InlineNotice
                  tone="error"
                  icon="circle-x"
                  title="Checks not recorded"
                  body={submitError}
                />
              ) : null}
            </>
          ) : null}
        </ScrollView>

        {order ? (
          <StickyActionBar>
            {blocked ? null : consequence ? (
              <Text className="text-body text-text-secondary">{consequence}</Text>
            ) : null}
            <PrimaryButton
              label={busy ? "Recording…" : checklistActionLabel(answers)}
              onPress={() => void submit()}
              disabled={busy || Boolean(blocked)}
              size="large"
            />
            {blocked ? (
              <Text className="text-center text-body text-text-secondary">{blocked}</Text>
            ) : null}
          </StickyActionBar>
        ) : null}
      </KeyboardAvoidingView>

      <BlockingOverlay
        visible={busy}
        label={passing ? "Recording the checks…" : "Escalating this pickup…"}
      />
    </Screen>
  );
}
