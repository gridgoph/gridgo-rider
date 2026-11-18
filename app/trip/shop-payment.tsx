import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { BlockingOverlay } from "@/components/BlockingOverlay";
import { CashPhotoField } from "@/components/CashPhotoField";
import { ExactCash } from "@/components/CashSlip";
import { CheckboxRow } from "@/components/CheckboxRow";
import { FormScroll } from "@/components/FormScroll";
import { InlineNotice } from "@/components/InlineNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { ProofStepSkeleton } from "@/components/SkeletonScreens";
import { StickyActionBar, StickyActionFallback } from "@/components/StickyActionBar";
import { TripStepHeader } from "@/components/TripStepHeader";
import { useCashPhoto } from "@/hooks/useCashPhoto";
import { useOrderCash } from "@/hooks/useOrderCash";
import { useTripOrder } from "@/hooks/useTripOrder";
import * as api from "@/lib/api";
import { cashAmountsOf, cashStage, newIdempotencyKey } from "@/lib/cash";
import { pickupLabel } from "@/lib/riderOrder";
import { useActiveTrip } from "@/store/activeTrip";
import { useSession } from "@/store/session";

/**
 * Pay the shop, at the counter, on a cash job (gridgo-api
 * `docs/CASH_ON_DELIVERY_API.md`, step 2).
 *
 * The exact price, the shop's receipt photographed, and the rider's word that
 * they handed over exactly that. The server records the cash advance and only
 * then opens the pickup checks — a receipt never skips the count, the six
 * checks, the packing photo or the shop's signature.
 *
 * A retry after a dropped connection resends the first request exactly, key
 * and body, so it returns the first answer instead of conflicting with it. A
 * new photo, or a definite refusal, starts a new request with a new key.
 */
export default function ShopPaymentScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === "string" ? orderId : null;
  const { order, loading, error: loadError } = useTripOrder(id);
  const cash = useOrderCash(order);
  const refreshTrip = useActiveTrip((s) => s.refresh);
  const userId = useSession((s) => s.user?.id ?? null);
  const amounts = cashAmountsOf(order);
  const stage = order ? cashStage(order, cash.detail) : "none";
  const receipt = useCashPhoto("cash_shop_receipt", "camera");
  const [paid, setPaid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionBarHeight, setActionBarHeight] = useState(0);
  // The first request, kept whole while its outcome is unknown: a retry after a
  // lost reply resends exactly it under the same key.
  const [attempt, setAttempt] = useState<{
    body: { expectedVersion: number; amountMinor: number; receiptFileId: string };
    key: string;
  } | null>(null);

  const blocked = !order
    ? "Loading the job."
    : !amounts || !cash.detail
      ? "Loading this job's cash amounts."
      : receipt.phase !== "stored"
        ? receipt.phase === "sending"
          ? "Wait for the receipt photo to finish sending."
          : "Photograph the shop's receipt."
        : !paid
          ? `Tick that you paid the shop exactly ${api.formatPhp(amounts.shopMinor)}.`
          : null;

  async function submit() {
    if (!order || !amounts || !cash.detail || !receipt.fileId || blocked || busy) return;
    const next =
      attempt?.body.receiptFileId === receipt.fileId
        ? attempt
        : {
            body: { expectedVersion: cash.detail.version, amountMinor: amounts.shopMinor, receiptFileId: receipt.fileId },
            key: newIdempotencyKey("shop-payment"),
          };
    setAttempt(next);
    setBusy(true);
    setError(null);
    try {
      await api.payShopCash(order.id, next.body, next.key);
      await refreshTrip(userId, "refresh");
      router.replace({ pathname: "/trip/pickup", params: { orderId: order.id } });
    } catch (e) {
      const code = api.apiErrorCode(e);
      // A definite refusal recorded nothing; no reply or a server error may have.
      if (e instanceof api.ApiError && e.status < 500) setAttempt(null);
      if (code === "cash_evidence_already_bound" || code === "cash_evidence_required") receipt.forget();
      if (code === "cash_stale" || code === "cash_idempotency_conflict" || code === "cash_shop_payment_not_available") {
        void cash.reload();
      }
      setError(api.tripRefusal(e, "The shop payment was not recorded. Keep the receipt and try again.").message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={[]}>
      <FormScroll contentClassName="gg-page gap-6 pb-8 pt-6" stickyActionHeight={actionBarHeight}>
        {loading ? <ProofStepSkeleton /> : null}

        {loadError ? <InlineNotice tone="error" icon="circle-x" title="This job did not load" body={loadError} /> : null}
        {cash.error ? (
          <InlineNotice
            tone="error"
            icon="circle-x"
            title="The cash amounts did not load"
            body={cash.error}
            actionLabel="Try again"
            onAction={() => void cash.reload()}
          />
        ) : null}

        {order && stage === "carry" && cash.fresh ? (
          <InlineNotice
            tone="success"
            icon="circle-check"
            title="The shop is paid"
            body="GRIDGO has the shop's receipt for this job. Check the job with the shop next."
          />
        ) : null}

        {order && amounts && stage === "pay_shop" ? (
          <>
            <TripStepHeader order={order} stopKind="pickup" stopLabel={pickupLabel(order)} />

            <View className="gg-card gap-3">
              <ExactCash
                label="Pay the shop, in cash"
                minor={amounts.shopMinor}
                note="Exactly this amount — the shop's price for this job. Ask for a receipt."
                testID="shop-cash-amount"
              />
            </View>

            <CashPhotoField
              photo={receipt}
              title="The shop's receipt"
              instruction="Photograph the receipt with the amount and the shop's name readable."
              source="camera"
              disabled={busy}
              testID="shop-receipt-photo"
            />

            <CheckboxRow
              checked={paid}
              onChange={setPaid}
              label={`I paid the shop exactly ${api.formatPhp(amounts.shopMinor)} in cash`}
              hint="Next you count and check the job with the shop."
              disabled={busy}
              testID="shop-paid-confirm"
            />

            {error ? <InlineNotice tone="error" icon="circle-x" title="Shop payment not recorded" body={error} /> : null}
          </>
        ) : null}
      </FormScroll>

      <StickyActionBar onHeight={setActionBarHeight} note={order && stage === "pay_shop" ? blocked : null}>
        {order && stage === "pay_shop" && amounts ? (
          <PrimaryButton
            label={busy ? "Recording…" : "Record shop payment"}
            onPress={() => void submit()}
            disabled={busy || Boolean(blocked)}
            size="large"
          />
        ) : order && stage === "carry" && cash.fresh ? (
          <PrimaryButton
            label="Check the job"
            onPress={() => router.replace({ pathname: "/trip/pickup", params: { orderId: order.id } })}
            size="large"
          />
        ) : (
          <StickyActionFallback loading={loading || !cash.fresh} onBack={() => router.back()} />
        )}
      </StickyActionBar>

      <BlockingOverlay visible={busy} label="Recording the shop payment…" />
    </Screen>
  );
}
