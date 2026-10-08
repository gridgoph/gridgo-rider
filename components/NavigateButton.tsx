import { Check, CircleAlert, Copy, ExternalLink, MapPinOff, Navigation } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";

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

type CopyState = "idle" | "copied" | "failed";

/**
 * Hands the ride to Google Maps, and stays honest when that cannot happen.
 *
 * Monochrome on purpose: it sits right above the screen's yellow step, and a
 * second loud button would make the rider choose between them. Height and the
 * leading glyph carry the weight instead; the trailing mark says it leaves the
 * app. A failed open or a missing pin keeps the stop reachable by copying the
 * address — never by sending a label for Maps to geocode somewhere else.
 */
function NavigateAction({ url, address }: { url: string | null; address: string }) {
  const colors = useThemeColors();
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copy, setCopy] = useState<CopyState>("idle");

  async function navigate() {
    if (!url || opening) return;
    setOpening(true);
    setFailed(false);
    setCopy("idle");
    try {
      await Linking.openURL(url);
    } catch {
      setFailed(true);
    } finally {
      setOpening(false);
    }
  }

  async function copyStop() {
    try {
      await copyAddress(address);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <View className="gap-3">
      {url ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Navigate in Google Maps"
          accessibilityHint={`Opens directions to ${address}`}
          accessibilityState={{ busy: opening, disabled: opening }}
          disabled={opening}
          onPress={navigate}
          className="min-h-12 flex-row items-center justify-center gap-2 rounded-field border border-outline bg-surface px-4"
        >
          {({ pressed }) => (
            <>
              <Navigation size={20} color={colors.textPrimary} strokeWidth={2} />
              <Text className="shrink text-body-lg font-bold text-text-primary">
                {opening ? "Opening Maps…" : "Navigate"}
              </Text>
              <ExternalLink size={16} color={colors.textMuted} strokeWidth={2} />
              {pressed || opening ? <View className="gg-pressed absolute inset-0 rounded-field" /> : null}
            </>
          )}
        </Pressable>
      ) : null}

      {failed || !url ? (
        <View className="gap-3 rounded-field bg-surface-variant p-3">
          <View
            className="flex-row gap-2"
            accessibilityRole="text"
            accessibilityLiveRegion="polite"
          >
            {url ? (
              <CircleAlert size={18} color={colors.warning} strokeWidth={2} />
            ) : (
              <MapPinOff size={18} color={colors.textMuted} strokeWidth={2} />
            )}
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-body font-bold text-text-primary">
                {url ? "Google Maps did not open" : "No exact pin for this stop"}
              </Text>
              <Text className="text-body text-text-secondary">
                {url
                  ? "Copy the address and paste it into your maps app, or try Navigate again."
                  : "Copy the address and look it up in your maps app."}
              </Text>
            </View>
          </View>

          <CopyAction state={copy} onPress={copyStop} />

          {copy === "failed" ? (
            <View className="gap-1" accessibilityLiveRegion="polite">
              <Text className="text-body text-text-secondary">
                Could not copy. Touch and hold the address to copy it.
              </Text>
              <Text selectable className="text-body-lg text-text-primary">{address}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function CopyAction({ state, onPress }: { state: CopyState; onPress: () => void }) {
  const colors = useThemeColors();
  const copied = state === "copied";
  const Icon = copied ? Check : Copy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copied ? "Address copied" : "Copy address"}
      onPress={onPress}
      className="min-h-11 flex-row items-center justify-center gap-2 rounded-field border border-outline bg-surface px-4"
    >
      {({ pressed }) => (
        <>
          <Icon size={18} color={copied ? colors.success : colors.textPrimary} strokeWidth={2} />
          <Text accessibilityLiveRegion="polite" className="shrink text-button text-text-primary">
            {copied ? "Address copied" : "Copy address"}
          </Text>
          {pressed ? <View className="gg-pressed absolute inset-0 rounded-field" /> : null}
        </>
      )}
    </Pressable>
  );
}
