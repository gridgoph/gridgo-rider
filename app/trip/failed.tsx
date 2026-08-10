import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChoiceList } from "@/components/ChoiceList";
import { DateTimeField } from "@/components/DateTimeField";
import { EvidenceCapture } from "@/components/EvidenceCapture";
import { InlineNotice } from "@/components/InlineNotice";
import { LoadingCard } from "@/components/Skeleton";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StickyActionBar } from "@/components/StickyActionBar";
import { SegmentedControl } from "@/components/SegmentedControl";
import { TripStepHeader } from "@/components/TripStepHeader";
import { useProofEvidence } from "@/hooks/useProofEvidence";
import { useThemeColors } from "@/hooks/useTheme";
import { useTripOrder } from "@/hooks/useTripOrder";
import * as api from "@/lib/api";
import { isEvidenceStored } from "@/lib/proofEvidence";
import {
  buildFailureNote,
  dropoffLabel,
  FAILURE_REASONS,
  type FailureOutcome,
  type FailureReasonId,
  failureOutcomeCommit,
  pickupLabel,
  suggestedOutcome,
} from "@/lib/riderOrder";
import { useTripProof } from "@/store/tripProof";

const OUTCOMES = [
  { id: "retry" as const, label: "Try again later" },
  { id: "return" as const, label: "Return to the supplier" },
];

const CONTACT_OPTIONS = [
  { id: "spoke" as const, label: "Spoke to them" },
  { id: "no_answer" as const, label: "No answer" },
  { id: "not_called" as const, label: "Did not call" },
];

type ContactId = (typeof CONTACT_OPTIONS)[number]["id"];

/** Two hours out, on the quarter hour — a realistic second attempt today. */
function defaultNextAttempt(): Date {
  const when = new Date(Date.now() + 2 * 60 * 60 * 1000);
  when.setMinutes(Math.ceil(when.getMinutes() / 15) * 15, 0, 0);
  return when;
}

/**
 * The record of a delivery that did not happen.
 *
 * This is the screen a dispute is reconstructed from months later, so it
 * captures what went wrong, whether the client was reachable, what the rider
 * did with the package, and a photo of the situation. Everything except the
 * note is a choice from a fixed set — nobody types a paragraph at a locked gate.
 */
export default function FailedAttemptScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === "string" ? orderId : null;
  const { order, loading, error: loadError } = useTripOrder(id);

  const { getDraft, saveDraft, clearDraft, recordAttempt, hydrated, hydrate } = useTripProof();

  const [reasonId, setReasonId] = useState<FailureReasonId | null>(null);
  const [outcome, setOutcome] = useState<FailureOutcome>("retry");
  const [outcomeTouched, setOutcomeTouched] = useState(false);
  const [contact, setContact] = useState<ContactId>("not_called");
  const [note, setNote] = useState("");
  const [nextAttemptAt, setNextAttemptAt] = useState<Date>(defaultNextAttempt);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [storage, setStorage] = useState<"available" | "unavailable" | "unknown">("unknown");

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // A report half-written in the rain survives the app being killed.
  useEffect(() => {
    if (!hydrated || !id || restored) return;
    const draft = getDraft(id, "failed");
    if (draft?.reasonId) setReasonId(draft.reasonId);
    if (draft?.outcome) {
      setOutcome(draft.outcome);
      setOutcomeTouched(true);
    }
    if (draft?.note) setNote(draft.note);
    if (draft?.nextAttemptAt) {
      const parsed = new Date(draft.nextAttemptAt);
      if (!Number.isNaN(parsed.getTime())) setNextAttemptAt(parsed);
    }
    setRestored(true);
  }, [hydrated, id, restored, getDraft]);

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
    step: "failed-attempt",
  });

  function pickReason(next: FailureReasonId) {
    setReasonId(next);
    if (id) saveDraft(id, "failed", { reasonId: next });
    // The reason usually decides what happens to the package. Follow it until
    // the rider says otherwise, then leave their choice alone.
    if (!outcomeTouched) setOutcome(suggestedOutcome(next));
  }

  const askContact = reasonId === "unavailable" || reasonId === "access";
  const photoStored = isEvidenceStored(evidence.upload);
  const storageDown =
    storage === "unavailable" ||
    (evidence.upload.phase === "failed" && !evidence.upload.retryable);

  const blocked = !reasonId
    ? "Choose what went wrong."
    : !photoStored && !storageDown
      ? "Photograph the door, the gate, or the wrong address before recording this."
      : null;

  const commit = useMemo(
    () =>
      failureOutcomeCommit(
        outcome,
        order ? pickupLabel(order) : "the supplier",
        outcome === "retry" ? nextAttemptAt : null,
      ),
    [outcome, order, nextAttemptAt],
  );

  async function record() {
    if (!order || !reasonId) return;
    setBusy(true);
    setSubmitError(null);

    const noteBody = buildFailureNote({
      reasonId,
      outcome,
      note: [
        note,
        photoStored ? null : "No photo attached — the file store was unreachable.",
      ]
        .filter(Boolean)
        .join(" "),
      nextAttemptAt: outcome === "retry" ? nextAttemptAt : null,
      contacted: askContact
        ? contact === "spoke"
          ? true
          : contact === "no_answer"
            ? false
            : undefined
        : undefined,
    });

    try {
      const { proof } = await api.submitProof(order.id, {
        kind: "failure",
        reason: reasonId,
        note: noteBody,
        photoName: evidence.evidence?.fileName,
      });
      // Only recorded here once the server accepted it — `proof.at` is the
      // server's own timestamp, not this phone's clock.
      recordAttempt(order.id, {
        reasonId,
        outcome,
        note: noteBody,
        at: proof.at,
        evidenceKind: photoStored ? (evidence.evidence?.kind ?? null) : null,
      });
      clearDraft(order.id, "failed");
      router.back();
    } catch (e) {
      setSubmitError(
        api.apiErrorMessage(
          e,
          "The attempt was not recorded. Try again, and call Operations if it keeps failing.",
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
                stopKind="dropoff"
                stopLabel={dropoffLabel(order)}
              />

              <Text className="text-body-lg text-text-secondary">
                The package stays with you either way. What you write here is what Operations
                and the client see, and what settles it if the client says it never arrived.
              </Text>

              <ChoiceList
                label="What happened"
                choices={FAILURE_REASONS}
                value={reasonId}
                onChange={pickReason}
                disabled={busy}
              />

              {askContact ? (
                <SegmentedControl
                  label="Did you reach the client?"
                  segments={CONTACT_OPTIONS}
                  value={contact}
                  onChange={setContact}
                  disabled={busy}
                />
              ) : null}

              <EvidenceCapture
                title="Photo of the situation"
                instruction="A closed gate, an empty doorway, the wrong house number — whatever shows why this could not be delivered."
                evidence={evidence.evidence}
                upload={evidence.upload}
                captureError={evidence.captureError}
                cameraBlocked={evidence.cameraBlocked}
                onTakePhoto={() => void evidence.takePhoto()}
                onRetry={evidence.retry}
                onClear={evidence.clear}
                disabled={busy}
              />

              {storageDown ? (
                <InlineNotice
                  tone="warning"
                  icon="triangle-alert"
                  title="Photos cannot be sent right now"
                  body="You can still file this report without one, and it will say so. Tell Operations that the file store is down."
                />
              ) : null}

              <View className="gap-2">
                <Text className="text-overline text-text-muted">ANYTHING ELSE</Text>
                <TextInput
                  value={note}
                  onChangeText={(next) => {
                    setNote(next);
                    if (id) saveDraft(id, "failed", { note: next });
                  }}
                  multiline
                  className="min-h-24 rounded-field border border-outline bg-surface px-3 py-3 text-body text-text-primary"
                  placeholder="Gate code, guard's name, when they said to come back…"
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Anything else about this attempt"
                />
                <Text className="text-caption text-text-muted">
                  Optional. Everything above is already in the report.
                </Text>
              </View>

              <SegmentedControl
                label="What happens to the package"
                segments={OUTCOMES}
                value={outcome}
                onChange={(next) => {
                  setOutcome(next);
                  setOutcomeTouched(true);
                  if (id) saveDraft(id, "failed", { outcome: next });
                }}
                disabled={busy}
              />

              {outcome === "retry" ? (
                <DateTimeField
                  label="Next attempt"
                  helper="The client and Operations see this, so pick a time you can make."
                  value={nextAttemptAt}
                  minimumDate={new Date()}
                  onChange={(next) => {
                    setNextAttemptAt(next);
                    if (id) saveDraft(id, "failed", { nextAttemptAt: next.toISOString() });
                  }}
                  disabled={busy}
                />
              ) : null}

              {submitError ? (
                <InlineNotice
                  tone="error"
                  icon="circle-x"
                  title="Attempt not recorded"
                  body={submitError}
                />
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/*
        No confirmation dialog: the consequence is stated here and the button
        names the exact outcome. See `failureOutcomeCommit`.
      */}
      {order ? (
        <StickyActionBar>
          {/*
            The consequence only earns its place once the report is complete —
            before that the rider has not chosen an outcome, and what is
            missing is the more useful sentence.
          */}
          {blocked ? null : (
            <Text className="text-body text-text-secondary">{commit.consequence}</Text>
          )}
          <PrimaryButton
            label={busy ? "Recording…" : commit.label}
            onPress={() => void record()}
            disabled={busy || Boolean(blocked)}
            size="large"
          />
          {blocked ? (
            <Text className="text-center text-body text-text-secondary">{blocked}</Text>
          ) : null}
        </StickyActionBar>
      ) : null}
    </SafeAreaView>
  );
}
