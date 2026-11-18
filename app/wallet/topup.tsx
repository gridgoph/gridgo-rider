import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";

import { ApprovalNotice } from "@/components/ApprovalNotice";
import { BlockingOverlay } from "@/components/BlockingOverlay";
import { CashPhotoField } from "@/components/CashPhotoField";
import { FormScroll } from "@/components/FormScroll";
import { InlineNotice } from "@/components/InlineNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SkeletonText } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { StickyActionBar } from "@/components/StickyActionBar";
import { TextField } from "@/components/TextField";
import { useCashPhoto } from "@/hooks/useCashPhoto";
import * as api from "@/lib/api";
import {
  cashEnabled,
  chipPesos,
  newIdempotencyKey,
  normaliseReference,
  paymentQrUrl,
  QR_PAPER,
  topupAmounts,
  topupBlockReason,
} from "@/lib/cash";
import { approvalPresentation } from "@/lib/riderApproval";
import { useSession } from "@/store/session";

type Loaded = { settings: api.OperationalSettings | null; amounts: number[] };

/**
 * A manual wallet top-up (gridgo-api `docs/CASH_ON_DELIVERY_API.md` → *Wallet*).
 *
 * The rider sends money to GRIDGO's receiving QR from their own payment app,
 * then tells GRIDGO which payment it was: the amount, the reference, and if
 * they like a screenshot. Nothing is spendable until Operations finds the
 * payment and confirms it — the screen says "Checking", and the wallet's
 * activity carries it to "Added" or "Not found".
 *
 * The QR is whatever a Super Admin last activated; with none, the screen says
 * so rather than inventing an account number. One key per body, so a retry
 * after a lost reply cannot file the same payment twice.
 *
 * Like the Wallet tab, it is closed to a rider Operations has not approved:
 * the approval notice instead of a payment form, and no wallet read at all.
 * Opening the route directly (a link, a restored stack) must not get round it.
 */
export default function WalletTopupScreen() {
  const router = useRouter();
  const { amount } = useLocalSearchParams<{ amount?: string }>();
  const canWork = approvalPresentation(useSession((s) => s.user)).canWork;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amountMinor, setAmountMinor] = useState<number | null>(() => {
    const parsed = Number(amount);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  });
  const [reference, setReference] = useState("");
  const screenshot = useCashPhoto("cash_topup_proof", "library");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ amountMinor: number; reference: string } | null>(null);
  const [attempt, setAttempt] = useState<{ body: string; key: string } | null>(null);
  const [actionBarHeight, setActionBarHeight] = useState(0);
  const [qrFailed, setQrFailed] = useState(false);

  useEffect(() => {
    if (!canWork) return;
    let live = true;
    void Promise.allSettled([api.getSettings(), api.getRiderWallet()]).then(([settings, wallet]) => {
      if (!live) return;
      if (settings.status === "rejected") {
        setLoadError(api.apiErrorMessage(settings.reason, "GRIDGO's payment details did not load. Go back and try again."));
      }
      setLoaded({
        settings: settings.status === "fulfilled" ? settings.value : null,
        amounts: topupAmounts(wallet.status === "fulfilled" ? wallet.value.wallet : null),
      });
    });
    return () => {
      live = false;
    };
  }, [canWork]);

  const cashOn = cashEnabled(loaded?.settings);
  const qrUrl = paymentQrUrl(loaded?.settings);
  const chosen = amountMinor != null && loaded?.amounts.includes(amountMinor) ? amountMinor : null;
  const blocked = !loaded
    ? "Loading GRIDGO's payment details."
    : !cashOn
      ? "Top-up is not open right now."
      : topupBlockReason({ amountMinor: chosen, reference, screenshot: screenshot.phase });

  async function submit() {
    if (!canWork || blocked || busy || chosen == null) return;
    const body = {
      amountMinor: chosen,
      reference: normaliseReference(reference),
      screenshotFileId: screenshot.phase === "stored" ? screenshot.fileId : null,
    };
    const text = JSON.stringify(body);
    const key = attempt?.body === text ? attempt.key : newIdempotencyKey("topup");
    setAttempt({ body: text, key });
    setBusy(true);
    setError(null);
    try {
      const topup = await api.submitWalletTopup(body, key);
      setSent({ amountMinor: topup.amountMinor, reference: topup.reference });
    } catch (e) {
      const code = api.apiErrorCode(e);
      if (code === "cash_evidence_already_bound" || code === "cash_evidence_required") screenshot.forget();
      setError(api.tripRefusal(e, "The top-up was not sent. Check the reference and try again.").message);
    } finally {
      setBusy(false);
    }
  }

  if (!canWork) {
    return (
      <Screen edges={[]}>
        <FormScroll contentClassName="gg-page gap-6 pb-8 pt-6" stickyActionHeight={actionBarHeight}>
          <ApprovalNotice />
        </FormScroll>
        <StickyActionBar onHeight={setActionBarHeight} note={null}>
          <PrimaryButton label="Back to wallet" onPress={() => router.back()} size="large" />
        </StickyActionBar>
      </Screen>
    );
  }

  if (sent) {
    return (
      <Screen edges={[]}>
        <FormScroll contentClassName="gg-page gap-6 pb-8 pt-6" stickyActionHeight={actionBarHeight}>
          <View className="gg-card gap-3" testID="topup-sent">
            <View className="flex-row">
              <StatusChip tone="warning" icon="clock" label="Checking" />
            </View>
            <Text className="text-h2 text-text-primary">{`${api.formatPhp(sent.amountMinor)} sent for checking`}</Text>
            <Text className="text-body-lg text-text-secondary">{`Reference ${sent.reference}`}</Text>
            <Text className="text-body text-text-secondary">
              {`Operations matches it against GRIDGO's account. When they confirm it, it is added to your wallet and the activity list says "Added". If they cannot find it, it says "Not found" — check the reference and send it again.`}
            </Text>
          </View>
        </FormScroll>
        <StickyActionBar onHeight={setActionBarHeight} note={null}>
          <PrimaryButton label="Back to wallet" onPress={() => router.back()} size="large" />
        </StickyActionBar>
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <FormScroll contentClassName="gg-page gap-6 pb-8 pt-6" stickyActionHeight={actionBarHeight}>
        {loadError ? <InlineNotice tone="error" icon="circle-x" title="Payment details did not load" body={loadError} /> : null}

        {loaded && !cashOn && !loadError ? (
          <InlineNotice
            tone="info"
            icon="info"
            title="Top-up is not open"
            body="GRIDGO is not taking wallet top-ups right now. Your balance and history stay in your wallet."
          />
        ) : null}

        {!loaded ? (
          <View className="gg-card gap-3" accessibilityLabel="Loading GRIDGO's payment details">
            <SkeletonText width="50%" />
            <SkeletonText width="100%" height={220} />
            <SkeletonText width="70%" />
          </View>
        ) : null}

        {loaded && cashOn ? (
          <>
            <View className="gap-1">
              <Text className="text-h2 text-text-primary">Top up your wallet</Text>
              <Text className="text-body-lg text-text-secondary">
                {"Pay GRIDGO's QR from your payment app, then tell GRIDGO the amount and the reference number."}
              </Text>
            </View>

            <SegmentedControl
              label="How much you sent"
              segments={loaded.amounts.map((minor) => ({ id: String(minor), label: chipPesos(minor) }))}
              value={chosen != null ? String(chosen) : ""}
              onChange={(id) => setAmountMinor(Number(id))}
              disabled={busy}
            />

            <View className="gg-card items-center gap-3" testID="topup-qr">
              <Text className="self-start text-body font-bold text-text-primary">Pay to GRIDGO</Text>
              {qrUrl && !qrFailed ? (
                // White paper behind the code in both themes, so any scanner reads it.
                <View className="rounded-field p-3" style={{ backgroundColor: QR_PAPER }}>
                  <Image
                    source={{ uri: qrUrl }}
                    accessibilityLabel="GRIDGO's payment QR code"
                    style={{ width: 220, height: 220 }}
                    resizeMode="contain"
                    onError={() => setQrFailed(true)}
                  />
                </View>
              ) : (
                <Text className="self-start text-body text-text-secondary">
                  {qrFailed
                    ? "The QR did not load. Go back and open top-up again."
                    : "GRIDGO has no payment QR set up yet. Ask Operations before you send any money."}
                </Text>
              )}
              {loaded.settings?.paymentQr?.caption ? (
                <Text className="self-start text-body text-text-secondary">{loaded.settings.paymentQr.caption}</Text>
              ) : null}
              {chosen != null ? (
                <Text className="self-start text-body-lg font-bold text-text-primary">{`Send exactly ${api.formatPhp(chosen)}`}</Text>
              ) : null}
            </View>

            <View className="gap-2">
              <Text className="text-body font-bold text-text-primary">Reference number</Text>
              <TextField
                value={reference}
                onChange={setReference}
                placeholder="From your payment app's receipt"
                accessibilityLabel="Reference number"
                autoCapitalize="characters"
                editable={!busy}
              />
            </View>

            <CashPhotoField
              photo={screenshot}
              title="Payment screenshot"
              instruction="A screenshot of the payment helps Operations find it faster."
              source="library"
              optional
              disabled={busy}
              testID="topup-screenshot"
            />

            {error ? <InlineNotice tone="error" icon="circle-x" title="Top-up not sent" body={error} /> : null}
          </>
        ) : null}
      </FormScroll>

      <StickyActionBar onHeight={setActionBarHeight} note={loaded && cashOn ? blocked : null}>
        {loaded && cashOn ? (
          <PrimaryButton
            label={busy ? "Sending…" : "Send for checking"}
            onPress={() => void submit()}
            disabled={busy || Boolean(blocked)}
            size="large"
          />
        ) : (
          <PrimaryButton label="Back to wallet" onPress={() => router.back()} size="large" />
        )}
      </StickyActionBar>

      <BlockingOverlay visible={busy} label="Sending your top-up…" />
    </Screen>
  );
}
