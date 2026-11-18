import { CircleX, Package, Route, Timer, TriangleAlert } from "lucide-react-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { CashOfferTerms } from "@/components/CashOfferTerms";

import { EarningAmount } from "@/components/EarningAmount";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StopList } from "@/components/StopList";
import { useRoute } from "@/hooks/useRoute";
import { useThemeColors } from "@/hooks/useTheme";
import type { Order } from "@/lib/api";
import { cashAmountsOf, isCashOrder } from "@/lib/cash";
import {
  cargoLines,
  cargoTotalLabel,
  countdownLabel,
  countdownSpoken,
  offerDistanceLabel,
} from "@/lib/dispatchOffer";
import { roadTimeEstimateLabel } from "@/lib/osrm";
import { pickupLabel, stopLatLng } from "@/lib/riderOrder";
import { riderPay, riderPayDetail } from "@/lib/riderPay";
import { tripDestination } from "@/lib/tripNav";

type Props = {
  offer: Order;
  /** Whole seconds left on the server's clock; null for an untimed offer. */
  secondsLeft: number | null;
  /** 0–1 of the countdown remaining, for the draining bar. */
  fractionLeft: number | null;
  busy: "accept" | "decline" | null;
  /** One plain line about the last tap that did not go through. */
  error: string | null;
  onAccept: () => void;
  onDecline: () => void;
};

/** At or under this, the countdown says so in words as well as in width. */
const HURRY_SECONDS = 10;

/**
 * One offer over the map, and the whole decision on it.
 *
 * Read top to bottom in the order the decision is made: how long is left, what
 * the rider takes home (`riderPay` — their own share, never the gross times a
 * rate), how far, where from and to, and what they carry. Decline and Accept
 * sit together at the bottom under the thumb; Accept is the panel's one
 * yellow.
 *
 * The countdown is a draining bar in the text colour, not yellow: the yellow
 * budget belongs to Accept, and a second yellow element on the same panel
 * would compete with it. Its seconds are also printed, so nothing depends on
 * reading a width, and a screen reader hears the time left rather than a bar.
 *
 * A cash offer swaps the fee line for the cash slip (`CashOfferTerms`): pay
 * the shop, collect, GRIDGO's share and what the rider keeps — the last one
 * carrying the earnings mark — and Accept waits for the rider to confirm they
 * have the shop's cash on them.
 *
 * Distance is the API's stored shop-to-drop-off figure. The API gives no
 * travel time, so a time appears only when the map router returns one, and is
 * labelled as its estimate.
 */
export function OfferSheet({ offer, secondsLeft, fractionLeft, busy, error, onAccept, onDecline }: Props) {
  const colors = useThemeColors();
  const pay = riderPay(offer);
  const payDetail = riderPayDetail(pay);
  const destination = tripDestination(offer);
  const { route } = useRoute({ from: stopLatLng(offer.pickup), to: destination.point });
  const distance = offerDistanceLabel(offer);
  const roadTime = roadTimeEstimateLabel(route);
  const cargo = cargoLines(offer);
  const cargoTotal = cargoTotalLabel(offer);
  const hurry = secondsLeft != null && secondsLeft <= HURRY_SECONDS;
  const expired = secondsLeft === 0;
  // A cash offer is accepted only with its four figures on screen and the
  // shop's cash confirmed in hand; a new offer starts unticked.
  const cash = isCashOrder(offer);
  const amounts = cashAmountsOf(offer);
  const [haveCash, setHaveCash] = useState<{ id: string; value: boolean }>({ id: offer.id, value: false });
  const cashReady = !cash || (amounts != null && haveCash.id === offer.id && haveCash.value);

  return (
    <View
      className="gap-4 rounded-t-card border border-b-0 border-outline bg-surface px-4 pb-4 pt-3"
      accessibilityLabel="Delivery offer"
      testID="offer-sheet"
    >
      {secondsLeft != null ? (
        <View className="gap-1.5">
          <View
            className="h-1.5 overflow-hidden rounded-pill bg-surface-variant"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <View
              className={hurry ? "h-full rounded-pill bg-warning" : "h-full rounded-pill bg-accent"}
              style={{ width: `${Math.round((fractionLeft ?? 0) * 100)}%` }}
            />
          </View>
          <View
            className="flex-row items-center justify-between"
            accessibilityRole="timer"
            accessibilityLabel={expired ? "This offer has timed out" : countdownSpoken(secondsLeft)}
            accessibilityLiveRegion={hurry ? "polite" : "none"}
          >
            <Text className="text-overline text-text-secondary">NEW DELIVERY OFFER</Text>
            <View className="flex-row items-center gap-1.5">
              {/*
                Urgency is said in words and an icon, never by the digits'
                colour alone: warning orange is 2.6:1 on a Light surface, so
                the text stays on text-primary in both themes.
              */}
              {hurry ? (
                <TriangleAlert size={16} color={colors.warning} strokeWidth={2.25} />
              ) : (
                <Timer size={16} color={colors.textSecondary} strokeWidth={2} />
              )}
              <Text className="text-body-lg font-bold text-text-primary" style={{ fontVariant: ["tabular-nums"] }}>
                {expired ? "Timed out" : hurry ? `Only ${countdownLabel(secondsLeft)} left` : `${countdownLabel(secondsLeft)} left`}
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <Text className="text-overline text-text-secondary">NEW DELIVERY OFFER</Text>
      )}

      {cash ? (
        amounts ? (
          <CashOfferTerms
            amounts={amounts}
            haveCash={haveCash.id === offer.id && haveCash.value}
            onHaveCash={(value) => setHaveCash({ id: offer.id, value })}
            disabled={busy !== null || expired}
          />
        ) : (
          <Text className="text-body text-text-secondary">
            {"This cash job's amounts did not load. Wait for the offer to refresh before you accept."}
          </Text>
        )
      ) : (
        <View className="gap-1">
          <Text className="text-caption text-text-secondary">You earn</Text>
          <EarningAmount minor={pay.earnedMinor} size="display" className="self-start" />
          {payDetail ? <Text className="text-caption text-text-secondary">{payDetail}</Text> : null}
        </View>
      )}

      {distance || roadTime ? (
        <View className="flex-row items-start gap-2">
          <View className="pt-0.5">
            <Route size={16} color={colors.textMuted} strokeWidth={2} />
          </View>
          <View className="min-w-0 flex-1">
            {distance ? <Text className="text-body-lg text-text-primary">{distance}</Text> : null}
            {roadTime ? <Text className="text-caption text-text-secondary">{roadTime}</Text> : null}
          </View>
        </View>
      ) : null}

      <StopList pickup={pickupLabel(offer)} dropoff={destination.label} />

      {cargo.length ? (
        <View className="gap-2 rounded-field bg-surface-variant p-3" accessibilityRole="text">
          <View className="flex-row items-center gap-2">
            <Package size={16} color={colors.textSecondary} strokeWidth={2} />
            <Text className="text-body font-bold text-text-primary">
              {cargoTotal ? `Cargo, ${cargoTotal}` : "Cargo"}
            </Text>
          </View>
          {cargo.slice(0, 3).map((line) => (
            <View key={line.key} className="flex-row justify-between gap-3">
              <Text className="min-w-0 flex-1 text-body text-text-secondary" numberOfLines={1}>
                {line.description}
              </Text>
              <Text className="text-body text-text-primary">{`× ${line.quantity}`}</Text>
            </View>
          ))}
          {cargo.length > 3 ? (
            <Text className="text-caption text-text-secondary">{`and ${cargo.length - 3} more`}</Text>
          ) : null}
        </View>
      ) : null}

      {error ? (
        <View className="flex-row items-start gap-2" accessibilityRole="alert">
          <View className="pt-0.5">
            <CircleX size={16} color={colors.error} strokeWidth={2} />
          </View>
          <Text className="min-w-0 flex-1 text-body text-error">{error}</Text>
        </View>
      ) : null}

      <View className="flex-row gap-3">
        <View className="flex-1">
          <SecondaryButton
            label={busy === "decline" ? "Declining…" : "Decline"}
            onPress={onDecline}
            disabled={busy !== null || expired || !offer.dispatchOffer?.id}
            size="large"
          />
        </View>
        <View className="flex-[2]">
          <PrimaryButton
            label={busy === "accept" ? "Accepting…" : "Accept"}
            onPress={onAccept}
            disabled={busy !== null || expired || !cashReady}
            size="large"
          />
        </View>
      </View>
    </View>
  );
}
