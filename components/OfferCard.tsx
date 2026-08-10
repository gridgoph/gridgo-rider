import { Banknote, Route } from "lucide-react-native";
import { Text, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { StatusChip } from "@/components/StatusChip";
import { StopList } from "@/components/StopList";
import { TripMap } from "@/components/TripMap";
import { useRoute } from "@/hooks/useRoute";
import { useThemeColors } from "@/hooks/useTheme";
import type { Order } from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { routeSummaryLabel } from "@/lib/osrm";
import { dropoffLabel, isCodOrder, pickupLabel, stopLatLng } from "@/lib/riderOrder";

/** Small enough to keep the whole decision on one screen, big enough to orient. */
const CARD_MAP_HEIGHT = 120;

type Props = {
  offer: Order;
  busy: boolean;
  onAccept: () => void;
};

/**
 * One dispatch offer, with everything the decision needs and nothing else.
 *
 * The fee decides it, so the fee is the second thing read, on the title line's
 * own row — it used to sit below a map and two full address cards, which put
 * the number a rider chooses on off the bottom of the screen. Distance comes
 * from OSRM; when routing fails the card says the line is direct and offers no
 * travel time rather than guessing one. One yellow Accept per card, and the
 * card is the bounded panel that owns it.
 */
export function OfferCard({ offer, busy, onAccept }: Props) {
  const colors = useThemeColors();
  const cod = isCodOrder(offer);
  const pickup = stopLatLng(offer.pickup);
  const dropoff = stopLatLng(offer.dropoff);
  const { route, loading: routeLoading } = useRoute({ from: pickup, to: dropoff });

  return (
    <View className="gg-card gap-4">
      <View className="gap-1">
        <View className="flex-row items-start justify-between gap-3">
          <Text className="min-w-0 flex-1 text-h3 text-text-primary">{offer.title}</Text>
          {cod ? (
            <View className="flex-row items-center gap-1.5 rounded-pill border border-warning px-3 py-1">
              <Banknote size={13} color={colors.warning} strokeWidth={2} />
              <Text className="text-caption text-warning">Cash on delivery</Text>
            </View>
          ) : (
            <StatusChip tone="neutral" label="Already paid" icon="circle-check" />
          )}
        </View>
        <Text className="text-caption text-text-muted">
          {offer.size} · {offer.material} · {offer.quantity} pcs
        </Text>
      </View>

      {/* The decision, on one line: what it pays and what it costs in time. */}
      <View className="flex-row items-end justify-between gap-4">
        <View className="gap-0.5">
          <Text className="text-overline text-text-muted">YOU EARN</Text>
          <Text className="text-h1 text-text-primary">{formatPhp(offer.deliveryFeeMinor)}</Text>
        </View>
        <View className="shrink flex-row items-center gap-2 pb-1">
          <Route size={16} color={colors.textMuted} strokeWidth={2} />
          <Text className="shrink text-body-lg text-text-secondary">
            {routeLoading && !route ? "Measuring…" : routeSummaryLabel(route)}
          </Text>
        </View>
      </View>

      <TripMap
        pickup={pickup}
        dropoff={dropoff}
        pickupLabel={pickupLabel(offer)}
        dropoffLabel={dropoffLabel(offer)}
        routeCoordinates={route?.coordinates ?? []}
        routeUnavailable={Boolean(route && !route.routed)}
        height={CARD_MAP_HEIGHT}
        compact
      />

      {route?.statusLabel ? (
        <Text className="text-caption text-text-muted">{route.statusLabel}</Text>
      ) : null}

      <StopList pickup={pickupLabel(offer)} dropoff={dropoffLabel(offer)} />

      {cod ? (
        <Text className="text-body text-text-secondary">
          Collect {formatPhp(offer.totalMinor + offer.deliveryFeeMinor)} in cash at the door.
        </Text>
      ) : null}

      <PrimaryButton
        label={busy ? "Accepting…" : "Accept this job"}
        onPress={onAccept}
        disabled={busy}
        size="large"
      />
    </View>
  );
}
