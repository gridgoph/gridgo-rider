import { Banknote } from "lucide-react-native";
import { Text, View } from "react-native";

import { AddressStop } from "@/components/AddressStop";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StatusChip } from "@/components/StatusChip";
import type { Order } from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { isCodOrder, zoneLabel } from "@/lib/riderOrder";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  offer: Order;
  busy: boolean;
  onAccept: () => void;
};

/**
 * One dispatch offer.
 *
 * Pickup and drop-off are shape-differentiated address cards. COD is called
 * out because it changes what the rider must do on arrival. One yellow Accept
 * is the only yellow on the card.
 */
export function OfferCard({ offer, busy, onAccept }: Props) {
  const colors = useThemeColors();
  const cod = isCodOrder(offer);

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

      <View className="gap-2">
        <AddressStop
          kind="pickup"
          address="Supplier print shop"
          detail="Collect the finished job here"
          zone={zoneLabel(offer.zone)}
        />
        <AddressStop
          kind="dropoff"
          address={offer.address}
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
