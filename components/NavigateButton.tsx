import { Navigation } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import type { Order } from "@/lib/api";
import { copyAddress } from "@/lib/copyAddress";
import { googleMapsDirectionsUrl } from "@/lib/mapsNavigation";
import { isActiveTripState } from "@/lib/riderOrder";
import { tripDestination, tripShop } from "@/lib/tripNav";
import { useSession } from "@/store/session";

type Props = { order: Order; stopKind: "pickup" | "dropoff" };

/** Assignment gates the whole control, including any failed-open recovery. */
export function NavigateButton({ order, stopKind }: Props) {
  const riderId = useSession((s) => s.user?.id);
  if (!riderId || order.riderId !== riderId || !isActiveTripState(order.state)) return null;
  const stop = stopKind === "pickup" ? tripShop(order) : tripDestination(order);
  const url = googleMapsDirectionsUrl(stop.point);
  return <NavigateAction key={`${order.id}:${stopKind}:${url}:${stop.label}`} url={url} address={stop.label} />;
}

function NavigateAction({ url, address }: { url: string | null; address: string }) {
  const colors = useThemeColors();
  const [failed, setFailed] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  async function navigate() {
    if (!url) return;
    setFailed(false);
    setCopyMessage(null);
    try {
      await Linking.openURL(url);
    } catch {
      setFailed(true);
    }
  }

  async function copy() {
    try {
      await copyAddress(address);
      setCopyMessage("Address copied.");
    } catch {
      setCopyMessage("Could not copy. Touch and hold the address below to copy it.");
    }
  }

  return (
    <View className="gap-2">
      {url ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Navigate"
          accessibilityHint={`Opens Google Maps directions to ${address}`}
          onPress={navigate}
          className="gg-btn-secondary gap-2"
        >
          {({ pressed }) => (
            <>
              <Navigation size={20} color={colors.textPrimary} strokeWidth={2} />
              <Text className="text-button text-text-primary">Navigate</Text>
              {pressed ? <View className="gg-pressed absolute inset-0 rounded-field" /> : null}
            </>
          )}
        </Pressable>
      ) : null}
      {failed || !url ? (
        <View className="gap-2">
          <Text accessibilityLiveRegion="polite" className="text-body text-text-secondary">
            {url ? "Could not open Google Maps. Copy the address and try in Maps." : "No exact pin is available. Copy the address to find this stop."}
          </Text>
          <SecondaryButton label="Copy address" onPress={copy} />
          {copyMessage ? (
            <>
              <Text accessibilityLiveRegion="polite" className="text-body text-text-secondary">{copyMessage}</Text>
              <Text selectable className="text-body text-text-primary">{address}</Text>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
