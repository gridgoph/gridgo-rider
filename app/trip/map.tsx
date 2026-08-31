import { useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/components/Screen";
import { TripMap } from "@/components/TripMap";
import { useRiderAction } from "@/hooks/useRiderAction";
import { useRiderLocation } from "@/hooks/useRiderLocation";
import { useRoute } from "@/hooks/useRoute";
import { useSnappedOrigin } from "@/hooks/useSnappedOrigin";
import { useThemeColors } from "@/hooks/useTheme";
import { nextStop, tripDestination, tripShop } from "@/lib/tripNav";
import { routeSummaryLabel } from "@/lib/osrm";
import { useActiveTrip } from "@/store/activeTrip";

/**
 * The trip, full screen.
 *
 * A map inside a scrolling page can never really be panned: the page claims
 * the drag, and a rider trying to look one street ahead scrolls the job
 * instead. Here the gesture is unambiguous, which is where a map wants to be
 * read anyway — and it is the same map, from the same trip, so nothing has to
 * be kept in step between two of them.
 *
 * It reads the trip from the store rather than taking it through the route, so
 * a position arriving while this is open moves the rider here as well.
 */
export default function TripMapScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const trip = useActiveTrip((s) => s.order);
  const { phase } = useRiderAction();
  const shop = trip ? tripShop(trip) : null;
  const destination = trip ? tripDestination(trip) : null;
  const heading = trip ? nextStop(trip, phase) : null;

  const riderLocation = useRiderLocation({
    enabled: Boolean(trip) && phase !== "complete" && phase !== "idle",
  });
  const routeFrom = useSnappedOrigin(riderLocation.coords);
  const { route } = useRoute({
    from: routeFrom,
    to: heading?.point ?? null,
    enabled: Boolean(trip) && Boolean(heading?.point) && Boolean(routeFrom),
  });

  return (
    <Screen edges={[]}>
      <View className="flex-1">
        <TripMap
          pickup={shop?.point ?? null}
          dropoff={destination?.point ?? null}
          pickupLabel={shop?.label ?? "Shop"}
          dropoffLabel={destination?.label ?? "Client"}
          pickupKind="shop"
          dropoffKind={destination?.kind === "office" ? "office" : "client"}
          focus={heading?.cardKind ?? null}
          routeCoordinates={route?.coordinates ?? []}
          routeUnavailable={Boolean(route && !route.routed)}
          rider={riderLocation.coords}
          riderAccuracy={riderLocation.accuracy}
          riderHeading={riderLocation.heading}
          navTitle={heading?.navTitle ?? null}
          navSummary={
            !routeFrom
              ? "Waiting for GPS"
              : route
                ? routeSummaryLabel(route)
                : "Measuring the road…"
          }
        />

        {/*
          One way out, top left, clear of the map's own zoom controls at the
          bottom right. Nothing else is drawn over the map: the job's actions
          are one tap behind this and putting them here would be a second place
          to do the same thing.
        */}
        <View
          pointerEvents="box-none"
          className="absolute inset-x-0 top-0 px-4"
          style={{ paddingTop: insets.top + 8 }}
        >
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close the map"
            hitSlop={8}
            className="gg-touch h-11 w-11 items-center justify-center rounded-pill"
            style={({ pressed }) => ({
              backgroundColor: colors.surface,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <X size={22} color={colors.textPrimary} strokeWidth={2} />
          </Pressable>
        </View>

        {!trip ? (
          <View
            className="absolute inset-x-0 bottom-0 p-4"
            style={{ paddingBottom: insets.bottom + 16 }}
            pointerEvents="none"
          >
            <View className="gg-card p-3">
              <Text className="text-body text-text-secondary">
                No trip in hand. Take one from Offers and it appears here.
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
