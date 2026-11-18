import { useLocalSearchParams, useRouter } from "expo-router";
import { Timer } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";

import { BlockingOverlay } from "@/components/BlockingOverlay";
import { CashPhotoField } from "@/components/CashPhotoField";
import { ContactBar } from "@/components/ContactBar";
import { FormScroll } from "@/components/FormScroll";
import { InlineNotice } from "@/components/InlineNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SegmentedControl } from "@/components/SegmentedControl";
import { ProofStepSkeleton } from "@/components/SkeletonScreens";
import { StickyActionBar, StickyActionFallback } from "@/components/StickyActionBar";
import { useCashNoShowRecord } from "@/hooks/useCashNoShowRecord";
import { useCashPhoto } from "@/hooks/useCashPhoto";
import { useOrderCash } from "@/hooks/useOrderCash";
import { useThemeColors } from "@/hooks/useTheme";
import { useTripOrder } from "@/hooks/useTripOrder";
import * as api from "@/lib/api";
import {
  newIdempotencyKey,
  noShowReportBlockReason,
  noShowSecondsLeft,
  waitMinutesLabel,
} from "@/lib/cash";
import { countdownLabel } from "@/lib/dispatchOffer";
import { useCashNoShow } from "@/store/cashNoShow";

const CONTACT = [
  { id: "call", label: "I called" },
  { id: "message", label: "I messaged" },
] as const;

/**
 * The client is not at the door, or will not pay (gridgo-api
 * `docs/CASH_ON_DELIVERY_API.md` → *No-show or refusal*).
 *
 * Three steps, each the server's: the rider calls or messages the client and
 * says which, which starts a wait the server measures; when it is over, a
 * photo of where they waited and one sentence of what happened. Operations
 * then takes it — the parcel goes back to GRIDGO Office, and once they confirm
 * it is there the shop payment returns to the rider's wallet.
 *
 * The timer on screen is this phone's reading of a wait the server started
 * (`store/cashNoShow.ts` keeps when). If the phone runs ahead, the server
 * refuses the report as early and the rider waits a little longer; nothing is
 * lost. If the client turns up, the rider goes back and collects as normal.
 */
export default function CashNoShowScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === "string" ? orderId : null;
  const { order, loading, error: loadError } = useTripOrder(id);
  const cash = useOrderCash(order);
  const record = useCashNoShowRecord(id, order, cash.detail);
  const markStarted = useCashNoShow((s) => s.started);
  const markReported = useCashNoShow((s) => s.reported);
  const photo = useCashPhoto("cash_no_show_photo", "camera");
  const [contact, setContact] = useState<"call" | "message">("call");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"start" | "report" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [actionBarHeight, setActionBarHeight] = useState(0);
  const [startAttempt, setStartAttempt] = useState<{
    body: { expectedVersion: number; contactMethod: "call" | "message" };
    key: string;
  } | null>(null);
  const [reportAttempt, setReportAttempt] = useState<{
    body: { expectedVersion: number; reason: string; photoFileId: string };
    key: string;
  } | null>(null);

  const waitSeconds = order?.cash?.noShowWaitSeconds ?? 600;
  const secondsLeft = noShowSecondsLeft(record?.startedAtMs ?? null, waitSeconds, now);
  const waiting = secondsLeft != null && secondsLeft > 0;
  const reported = Boolean(record?.reportedAtMs);

  useEffect(() => {
    if (!waiting) return;
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, [waiting]);

  async function start() {
    if (!order || !cash.detail || busy) return;
    setBusy("start");
    setError(null);
    const body = { expectedVersion: cash.detail.version, contactMethod: contact };
    const attempt =
      startAttempt && startAttempt.body.contactMethod === contact ? startAttempt : { body, key: newIdempotencyKey("no-show-start") };
    setStartAttempt(attempt);
    try {
      await api.startCashNoShow(order.id, attempt.body, attempt.key);
      markStarted(order.id, contact, Date.now());
      setNow(Date.now());
      void cash.reload();
    } catch (e) {
      const code = api.apiErrorCode(e);
      if (e instanceof api.ApiError && e.status < 500) setStartAttempt(null);
      if (code === "cash_stale") void cash.reload();
      if (code === "cash_no_show_not_available" && !record) {
        // The server already has a wait for this job that this phone lost
        // track of. Time a full wait from now: never shorter than the server's.
        markStarted(order.id, contact, Date.now());
        setNow(Date.now());
        return;
      }
      setError(api.tripRefusal(e, "The wait did not start. Check your connection and try again.").message);
    } finally {
      setBusy(null);
    }
  }

  const reportBlocked = noShowReportBlockReason({ secondsLeft, reason, photo: photo.phase });

  async function report() {
    if (!order || !cash.detail || !photo.fileId || reportBlocked || busy) return;
    const fresh = { expectedVersion: cash.detail.version, reason: reason.trim(), photoFileId: photo.fileId };
    // Same photo and words as an unanswered report: resend it exactly, key and version.
    const attempt =
      reportAttempt && reportAttempt.body.photoFileId === fresh.photoFileId && reportAttempt.body.reason === fresh.reason
        ? reportAttempt
        : { body: fresh, key: newIdempotencyKey("no-show-report") };
    setReportAttempt(attempt);
    setBusy("report");
    setError(null);
    try {
      await api.reportCashNoShow(order.id, attempt.body, attempt.key);
      markReported(order.id, Date.now());
    } catch (e) {
      const code = api.apiErrorCode(e);
      if (e instanceof api.ApiError && e.status < 500) setReportAttempt(null);
      if (code === "cash_stale") void cash.reload();
      if (code === "cash_evidence_already_bound" || code === "cash_evidence_required") photo.forget();
      setError(api.tripRefusal(e, "The report was not sent. Stay at the door and try again.").message);
    } finally {
      setBusy(null);
    }
  }

  const blocked = !order ? "Loading the job." : !cash.detail ? "Loading this job's cash record." : null;

  return (
    <Screen edges={[]}>
      <FormScroll contentClassName="gg-page gap-6 pb-8 pt-6" stickyActionHeight={actionBarHeight}>
        {loading ? <ProofStepSkeleton /> : null}
        {loadError ? <InlineNotice tone="error" icon="circle-x" title="This job did not load" body={loadError} /> : null}
        {cash.error ? (
          <InlineNotice
            tone="error"
            icon="circle-x"
            title="The cash record did not load"
            body={cash.error}
            actionLabel="Try again"
            onAction={() => void cash.reload()}
          />
        ) : null}

        {order && reported ? (
          <InlineNotice
            tone="success"
            icon="circle-check"
            title="No-show reported"
            body="Operations has your report and photo. Take the package to GRIDGO Office. When they confirm it is back, the shop payment returns to your wallet."
          />
        ) : null}

        {order && !reported ? (
          <>
            <View className="gap-1">
              <Text className="text-h2 text-text-primary">{"The client is not here, or won't pay"}</Text>
              <Text className="text-body-lg text-text-secondary">
                {`Call or message them first. If they still don't come, or refuse to pay, wait ${waitMinutesLabel(waitSeconds)} at the door, then report it with a photo. Keep the package with you.`}
              </Text>
            </View>

            <ContactBar trip={order} party="client" />

            {secondsLeft == null ? (
              <View className="gap-2">
                <SegmentedControl
                  label="How you tried the client"
                  segments={CONTACT}
                  value={contact}
                  onChange={setContact}
                  disabled={busy !== null}
                />
                <Text className="text-caption text-text-secondary">
                  GRIDGO times the wait from when you start it, not from when you arrived.
                </Text>
              </View>
            ) : (
              <View
                className="gg-card items-center gap-2"
                accessibilityRole="timer"
                accessibilityLabel={
                  waiting ? `${countdownLabel(secondsLeft)} left to wait at the door` : "The wait is over. You can report the no-show."
                }
                testID="no-show-timer"
              >
                <View className="flex-row items-center gap-2">
                  <Timer size={20} color={colors.textSecondary} strokeWidth={2} />
                  <Text className="text-body text-text-secondary">{waiting ? "Wait at the door" : "The wait is over"}</Text>
                </View>
                <Text className="text-display text-text-primary" style={{ fontVariant: ["tabular-nums"] }}>
                  {countdownLabel(secondsLeft)}
                </Text>
                <Text className="text-center text-body text-text-secondary">
                  {waiting
                    ? "Keep trying the client. If they come and pay, go back and collect as normal."
                    : "Photograph where you waited and say what happened."}
                </Text>
              </View>
            )}

            {secondsLeft != null && !waiting ? (
              <>
                <CashPhotoField
                  photo={photo}
                  title="Where you waited"
                  instruction="Photograph the door or gate with the house number in frame."
                  source="camera"
                  disabled={busy !== null}
                  testID="no-show-photo"
                />
                <View className="gap-2">
                  <Text className="text-body font-bold text-text-primary">What happened</Text>
                  <TextInput
                    value={reason}
                    onChangeText={setReason}
                    editable={busy === null}
                    multiline
                    maxLength={120}
                    className="min-h-24 rounded-field border border-outline bg-surface px-3 py-3 text-body text-text-primary"
                    placeholder="No answer at the gate after two calls"
                    placeholderTextColor={colors.textMuted}
                    accessibilityLabel="What happened at the door"
                  />
                  <Text className="text-caption text-text-secondary">Operations reads this. One sentence is enough.</Text>
                </View>
              </>
            ) : null}

            {secondsLeft != null ? (
              <SecondaryButton label="The client is here — collect" onPress={() => router.back()} disabled={busy !== null} />
            ) : null}

            {error ? <InlineNotice tone="error" icon="circle-x" title="Not recorded" body={error} /> : null}
          </>
        ) : null}
      </FormScroll>

      <StickyActionBar
        onHeight={setActionBarHeight}
        note={!order || reported ? null : blocked ?? (secondsLeft == null ? null : reportBlocked)}
      >
        {order && reported ? (
          <PrimaryButton label="Back to the map" onPress={() => router.dismissTo("/map")} size="large" />
        ) : order && secondsLeft == null ? (
          <PrimaryButton
            label={busy === "start" ? "Starting…" : `Start the ${waitMinutesLabel(waitSeconds)} wait`}
            onPress={() => void start()}
            disabled={busy !== null || Boolean(blocked)}
            size="large"
          />
        ) : order ? (
          <PrimaryButton
            label={busy === "report" ? "Reporting…" : "Report no-show"}
            onPress={() => void report()}
            disabled={busy !== null || Boolean(blocked) || Boolean(reportBlocked)}
            size="large"
          />
        ) : (
          <StickyActionFallback loading={loading} onBack={() => router.back()} />
        )}
      </StickyActionBar>

      <BlockingOverlay visible={busy !== null} label={busy === "report" ? "Sending your report…" : "Starting the wait…"} />
    </Screen>
  );
}
