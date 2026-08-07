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
import {
  dropoffLabel,
  isCodOrder,
  pickupLabel,
  stopLatLng,
  zoneLabel,
} from "@/lib/riderOrder";
import { routeSummaryLabel } from "@/lib/osrm";

type Props = {
  offer: Order;
  busy: boolean;
  onAccept: () => void;
};

/**
 * One dispatch offer with map context to decide.
 *
 * Pickup and drop-off are shape-differentiated. Road distance and duration
 * come from OSRM (straight-line estimate when routing fails). One yellow
 * Accept is the only yellow on the card.
 */
export function OfferCard({ offer, busy, onAccept }: Props) {
  const colors = useThemeColors();
  const cod = isCodOrder(offer);
  const pickup = stopLatLng(offer.pickup);
  const dropoff = stopLatLng(offer.dropoff);
  const { route, loading: routeLoading } = useRoute({
    from: pickup,
    to: dropoff,
  });

  return (
    <View className="gg-card gap-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-h3 text-text-primary">{offer.title}</Text>
          <Text className="text-caption text-text-muted">
            {offer.size} · {offer.material} · qty {offer.quantity}
          </Text>
        </View>
        {cod ? (
          <View className="flex-row items-center gap-1.5 rounded-pill border border-warning px-3 py-1">
            <Banknote size={13} color={colors.warning} strokeWidth={2} />
            <Text className="text-caption text-warning">COD</Text>
          </View>
        ) : (
          <StatusChip tone="neutral" label="Prepaid" icon="circle-check" />
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

      <View className="flex-row items-center gap-2">
        <Route size={16} color={colors.textMuted} strokeWidth={2} />
        <Text className="flex-1 text-body text-text-secondary">
          {routeLoading && !route
            ? "Measuring route…"
            : routeSummaryLabel(route)}
        </Text>
      </View>
      {route?.statusLabel ? (
        <Text className="text-caption text-text-muted">{route.statusLabel}</Text>
      ) : null}

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

      <View className="flex-row items-end justify-between gap-3 border-t border-outline-subtle pt-3">
        <View>
          <Text className="text-caption text-text-muted">Delivery fee</Text>
          <Text className="text-body-lg text-text-primary">
            {formatPhp(offer.deliveryFeeMinor)}
          </Text>
        </View>
        {cod ? (
          <Text className="shrink text-caption text-text-secondary">
            Cash collection required on arrival
          </Text>
        ) : null}
      </View>

      <PrimaryButton
        label={busy ? "Accepting…" : "Accept"}
        onPress={onAccept}
        disabled={busy}
      />
    </View>
  );
}
