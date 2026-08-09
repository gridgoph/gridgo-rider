import { Banknote, Route } from "lucide-react-native";
import { Text, View } from "react-native";

import { AddressStop } from "@/components/AddressStop";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StatusChip } from "@/components/StatusChip";
import { TripMap } from "@/components/TripMap";
import { useRoute } from "@/hooks/useRoute";
import { useThemeColors } from "@/hooks/useTheme";
import type { Order } from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { routeSummaryLabel } from "@/lib/osrm";
import {
  dropoffLabel,
  isCodOrder,
  pickupLabel,
  stopLatLng,
  zoneLabel,
} from "@/lib/riderOrder";

type Props = {
  offer: Order;
  busy: boolean;
  onAccept: () => void;
};

/**
 * One dispatch offer, with everything the decision needs and nothing else.
 *
 * The fee is the number a rider decides on, so it is the largest thing here
 * after the job name. Distance comes from OSRM; when routing fails the card
 * says the line is direct and offers no travel time rather than guessing one.
 * One yellow Accept per card, and the card is the bounded panel that owns it.
 */
export function OfferCard({ offer, busy, onAccept }: Props) {
  const colors = useThemeColors();
  const cod = isCodOrder(offer);
  const pickup = stopLatLng(offer.pickup);
  const dropoff = stopLatLng(offer.dropoff);
  const { route, loading: routeLoading } = useRoute({ from: pickup, to: dropoff });

  return (
    <View className="gg-card gap-5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-h3 text-text-primary">{offer.title}</Text>
          <Text className="text-caption text-text-muted">
            {offer.size} · {offer.material} · {offer.quantity} pcs
          </Text>
        </View>
        {cod ? (
          <View className="flex-row items-center gap-1.5 rounded-pill border border-warning px-3 py-1">
            <Banknote size={13} color={colors.warning} strokeWidth={2} />
            <Text className="text-caption text-warning">Cash on delivery</Text>
          </View>
        ) : (
          <StatusChip tone="neutral" label="Already paid" icon="circle-check" />
        )}
      </View>

      <TripMap
        pickup={pickup}
        dropoff={dropoff}
        pickupLabel={pickupLabel(offer)}
        dropoffLabel={dropoffLabel(offer)}
        routeCoordinates={route?.coordinates ?? []}
        routeUnavailable={Boolean(route && !route.routed)}
        height={160}
        compact
      />

      <View className="gap-2">
        <View className="flex-row items-center gap-2">
          <Route size={16} color={colors.textMuted} strokeWidth={2} />
          <Text className="flex-1 text-body text-text-secondary">
            {routeLoading && !route ? "Measuring the route…" : routeSummaryLabel(route)}
          </Text>
        </View>
        {route?.statusLabel ? (
          <Text className="text-caption text-text-muted">{route.statusLabel}</Text>
        ) : null}
      </View>

      <View className="gap-2">
        <AddressStop
          kind="pickup"
          address={pickupLabel(offer)}
          detail="Collect the finished job here"
          zone={zoneLabel(offer.zone)}
        />
        <AddressStop
          kind="dropoff"
          address={dropoffLabel(offer)}
          zone={zoneLabel(offer.zone)}
        />
      </View>

      <View className="flex-row items-end justify-between gap-4 border-t border-outline-subtle pt-4">
        <View className="gap-0.5">
          <Text className="text-overline text-text-muted">YOU EARN</Text>
          <Text className="text-h2 text-text-primary">{formatPhp(offer.deliveryFeeMinor)}</Text>
        </View>
        {cod ? (
          <Text className="shrink text-right text-caption text-text-secondary">
            Collect {formatPhp(offer.totalMinor + offer.deliveryFeeMinor)} in cash on arrival
          </Text>
        ) : null}
      </View>

      <PrimaryButton
        label={busy ? "Accepting…" : "Accept this job"}
        onPress={onAccept}
        disabled={busy}
        size="large"
      />
    </View>
  );
}
