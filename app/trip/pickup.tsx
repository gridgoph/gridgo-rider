import { ArtworkPanel } from "@/components/ArtworkPanel";
import { ProductionSpecifications } from "@/components/ProductionSpecifications";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";

import { BlockingOverlay } from "@/components/BlockingOverlay";
import { EvidenceCapture } from "@/components/EvidenceCapture";
import { FormScroll } from "@/components/FormScroll";
import { InlineNotice } from "@/components/InlineNotice";
import { PickupBlockedPanel } from "@/components/PickupBlockedPanel";
import { PickupCheckRow } from "@/components/PickupCheckRow";
import { PickupCountField } from "@/components/PickupCountField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { PickupChecklistSkeleton } from "@/components/SkeletonScreens";
import { StickyActionBar } from "@/components/StickyActionBar";
import { TripStepHeader } from "@/components/TripStepHeader";
import { useProofEvidence } from "@/hooks/useProofEvidence";
import { useThemeColors } from "@/hooks/useTheme";
import { useTripOrder } from "@/hooks/useTripOrder";
import * as api from "@/lib/api";
import { PICKUP_FAILURE_TARGETS } from "@/lib/attachments";
import {
  canRunPickupChecks,
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
import {
  countBlockReason,
  countKey,
  countMode,
  draftCountProblem,
  effectiveAnswers,
  toCountPayload,
  type CountDraft,
} from "@/lib/pickupCount";
import { pickupLabel } from "@/lib/riderOrder";
import { useActiveTrip } from "@/store/activeTrip";
import { useTripProof } from "@/store/tripProof";

/**
 * The six-point pickup check and the count, at the supplier's counter.
 *
 * This is the screen that decides whether a package moves at all. The first
 * check is the count — one number per line of the order, typed by the rider,
 * against what the server says was ordered (`lib/pickupCount.ts`) — and the
 * other five are answered by hand. One problem stops the job: the package
 * stays at the shop, GRIDGO logs the fault against the supplier who caused it,
 * and Operations is alerted. Six passes go on to the supplier's signature
 * (`app/trip/handoff.tsx`), which is what sends them with the counts.
 *
 * A failure is a `200` that leaves the order at the shop, so the screen reads
 * the order it gets back and becomes the blocked receipt
 * (`PickupBlockedPanel`) rather than stepping back as if something moved.
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
  const { order, setOrder, loading, error: loadError, reload } = useTripOrder(id);
  const setActiveOrder = useActiveTrip((s) => s.setOrder);

  const {
    getChecklist,
    answerCheck,
    saveFailureNote,
    saveCount,
    markChecked,
    clearChecklist,
    hydrated,
    hydrate,
  } = useTripProof();

  const [answers, setAnswers] = useState<ChecklistAnswers>(() => ({ ...EMPTY_ANSWERS }));
  const [counts, setCounts] = useState<CountDraft>({});
  const [failureNote, setFailureNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [restoredFor, setRestoredFor] = useState<string | null>(null);
  // The action bar rides above the keyboard, so the escalation note has to
  // clear the bar as well as the keyboard to stay readable while it is typed.
  const [actionBarHeight, setActionBarHeight] = useState(0);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Six answers half-given survive the app being killed at the counter.
  // Restored on render, once per job, so the first frame after hydration
  // already shows them rather than a blank list that fills in a beat later.
  const restored = Boolean(id) && restoredFor === id;
  if (hydrated && id && !restored) {
    const draft = getChecklist(id);
    if (draft) {
      setAnswers(draft.answers);
      setFailureNote(draft.failureNote);
      setCounts(draft.counts ?? {});
    }
    setRestoredFor(id);
  }

  const evidence = useProofEvidence({
    orderId: id ?? "",
    step: "pickup",
    targets: PICKUP_FAILURE_TARGETS,
  });

  const mode = order ? countMode(order) : ({ kind: "legacy" } as const);
  // What will be sent: in count mode the quantity check is read off the numbers.
  const effective = effectiveAnswers(answers, mode, counts);
  const answered = allAnswered(effective);
  const passing = allPassed(effective);
  const failing = answered && !passing;
  const evidenceFileId = evidence.stored.delivery_photo ?? null;
  const escalated = order?.pickupChecklist?.status === "failed_escalated";

  const blocked = !order
    ? "Loading the job."
    : !canRunPickupChecks(order)
      ? "Pickup checks are unavailable. Return to the trip for the current step or Operations update."
      : !restored
        ? "Restoring your pickup checks…"
        : (countBlockReason(mode, counts) ??
          checklistBlockReason(effective, {
            note: failureNote,
            evidenceStored: Boolean(evidenceFileId),
          }));

  const consequence = checklistConsequence(
    effective,
    mode.kind === "count" ? draftCountProblem(mode.items, counts) : null,
  );

  function answer(code: (typeof PICKUP_CHECKS)[number]["code"], passed: boolean) {
    setAnswers((current) => ({ ...current, [code]: passed }));
    if (id) answerCheck(id, code, passed);
  }

  function count(key: string, counted: number | null) {
    setCounts((current) => ({ ...current, [key]: counted }));
    if (id) saveCount(id, key, counted);
  }

  async function submit() {
    if (!order || blocked || submitting.current) return;
    if (passing) {
      markChecked(order.id);
      /*
        Six passes are not sent from here. The supplier still has to sign on
        this phone, and the server records the checks and the signature in
        one step — so the answers stay in the draft and the signature screen
        sends both. It replaces this screen rather than stacking on it: the
        signature is the next step, not a confirmation of this one.
      */
      router.replace({ pathname: "/trip/handoff", params: { orderId: order.id } });
      return;
    }
    submitting.current = true;
    setBusy(true);
    setSubmitError(null);
    try {
      const result = await api.submitPickupChecklist(
        order.id,
        toChecklistPayload(effective),
        toCountPayload(mode, counts),
        evidenceFileId
          ? { failure: { failureNote: failureNote.trim(), evidenceFileIds: [evidenceFileId] } }
          : undefined,
      );
      setActiveOrder(result.order);
      clearChecklist(order.id);
      // The escalation is a 200 that leaves the package at the shop: stay, and
      // let the returned order turn this screen into the blocked receipt.
      if (result.order.pickupChecklist?.status === "failed_escalated") {
        setOrder(result.order);
      } else {
        router.back();
      }
    } catch (e) {
      const code = api.apiErrorCode(e);
      // The lines to count, or the escalation, changed under the rider: show
      // the order as it is now rather than the one the numbers were typed for.
      if (
        code === "invalid_pickup_counts" ||
        code === "pickup_count_unavailable" ||
        code === "pickup_escalation_open"
      ) {
        void reload("refresh");
      }
      setSubmitError(
        api.apiErrorMessage(
          e,
          "The checks were not recorded. Try again before the package leaves the counter.",
        ),
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Screen edges={["bottom"]}>
      <FormScroll
        contentClassName="gg-page gap-6 pb-8 pt-6"
        stickyActionHeight={actionBarHeight}
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

        {order && escalated ? (
          <>
            <TripStepHeader order={order} stopKind="pickup" stopLabel={pickupLabel(order)} />
            <PickupBlockedPanel order={order} />
          </>
        ) : null}

        {order && !escalated ? (
          <>
            <TripStepHeader order={order} stopKind="pickup" stopLabel={pickupLabel(order)} />

            <Text className="text-body-lg text-text-secondary">
              At the shop, count the pieces and run all six checks together with the supplier
              before the package leaves the counter. If anything is off, leave the package at
              the shop and send a photo and a note for Operations to resolve.
            </Text>

            <ProductionSpecifications order={order} />
            <ArtworkPanel order={order} />

            {order.pickupChecklist?.status === "escalation_resolved" ? (
              <InlineNotice
                tone="info"
                icon="info"
                title="Operations has answered"
                body="Count again and run all six together with the supplier, on the batch in front of you now."
              />
            ) : null}

            <View className="gg-card-flush">
              {PICKUP_CHECKS.map((check, index) => (
                <PickupCheckRow
                  key={check.code}
                  index={index}
                  check={
                    check.code === "quantity_match" && mode.kind !== "legacy"
                      ? { ...check, label: "Count the pieces", verify: COUNT_VERIFY }
                      : check
                  }
                  answer={effective[check.code]}
                  onAnswer={(passed) => answer(check.code, passed)}
                  disabled={busy || !canRunPickupChecks(order)}
                >
                  {check.code !== "quantity_match" ? undefined : mode.kind === "count" ? (
                    <View className="overflow-hidden rounded-field bg-surface-variant">
                      {mode.items.map((item, line) => (
                        <View
                          key={countKey(item.lineItemId)}
                          className={line > 0 ? "border-t border-outline" : undefined}
                        >
                          <PickupCountField
                            item={item}
                            counted={counts[countKey(item.lineItemId)] ?? null}
                            onChange={(next) => count(countKey(item.lineItemId), next)}
                            disabled={busy || !canRunPickupChecks(order)}
                          />
                        </View>
                      ))}
                    </View>
                  ) : mode.kind === "unavailable" ? (
                    <InlineNotice
                      tone="warning"
                      icon="triangle-alert"
                      title="No count to check against"
                      body="This order is missing the number of pieces ordered, so the pickup cannot be recorded. Call Operations to review it before you take anything."
                    />
                  ) : undefined}
                </PickupCheckRow>
              ))}
            </View>

            {failing ? (
              <>
                <InlineNotice
                  tone="error"
                  icon="circle-x"
                  title="Do not transport this package"
                  body="Leave it at the shop. GRIDGO records the fault against the supplier and alerts Operations — then tells you what to do next."
                />

                <EvidenceCapture
                  key={id}
                  title="Photo of the problem"
                  instruction="Photograph the fault itself — the misprint, the tear, the short count on the counter."
                  evidence={evidence.evidence}
                  upload={evidence.upload}
                  captureError={evidence.captureError}
                  cameraBlocked={evidence.cameraBlocked}
                  onTakePhoto={() => void evidence.takePhoto()}
                  onRetry={evidence.retry}
                  onClear={evidence.clear}
                  disabled={busy || !canRunPickupChecks(order)}
                />

                <View className="gap-2">
                  <Text className="text-overline text-text-muted">WHAT IS WRONG</Text>
                  <TextInput
                    value={failureNote}
                    onChangeText={(next) => {
                      setFailureNote(next);
                      if (id) saveFailureNote(id, next);
                    }}
                    editable={!busy}
                    multiline
                    className="min-h-24 rounded-field border border-outline bg-surface px-3 py-3 text-body text-text-primary"
                    placeholder="Counted 180 of 200, and the first 40 pieces are smudged…"
                    placeholderTextColor={colors.textMuted}
                    accessibilityLabel="What is wrong with this package"
                  />
                  <Text className="text-caption text-text-muted">
                    Operations, the shop and the founder read this. Say what you can see, not
                    what you think caused it.
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
      </FormScroll>

      {order && escalated ? (
        <StickyActionBar onHeight={setActionBarHeight}>
          <SecondaryButton label="Back to the trip" onPress={() => router.back()} size="large" />
        </StickyActionBar>
      ) : null}

      {order && !escalated ? (
        <StickyActionBar onHeight={setActionBarHeight}>
          {blocked ? null : consequence ? (
            <Text className="text-body text-text-secondary">{consequence}</Text>
          ) : null}
          <PrimaryButton
            label={busy ? "Recording…" : checklistActionLabel(effective)}
            onPress={() => void submit()}
            disabled={busy || Boolean(blocked)}
            size="large"
          />
          {blocked ? (
            <Text className="text-center text-body text-text-secondary">{blocked}</Text>
          ) : null}
        </StickyActionBar>
      ) : null}

      <BlockingOverlay visible={busy} label="Escalating this pickup…" />
    </Screen>
  );
}

const COUNT_VERIFY =
  "Count every piece together with the supplier and type what you counted for each line — not what the ticket says.";
