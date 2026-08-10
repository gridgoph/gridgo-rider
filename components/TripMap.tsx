import { useEffect, useMemo, useRef } from "react";
import { Text, View } from "react-native";

import { MapFrame, type MapFrameHandle } from "@/components/MapFrame";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import { isValidLatLng, type LatLng, type LonLat } from "@/lib/geo";
import { buildMapHtml, type MapModel } from "@/lib/mapHtml";

type Props = {
  pickup: LatLng | null;
  dropoff: LatLng | null;
  pickupLabel?: string;
  dropoffLabel?: string;
  /** GeoJSON [lon, lat] route coordinates. */
  routeCoordinates?: LonLat[];
  rider?: LatLng | null;
  routeUnavailable?: boolean;
  /** Fixed height for offer cards; omit for flex fill on Active. */
  height?: number;
  /** Compact mode for list cards. */
  compact?: boolean;
};

/**
 * Leaflet map over OpenStreetMap tiles.
 *
 * No Google Maps, no API key. Attribution is always visible (licence).
 * When tiles fail to load the surrounding addresses and actions still work —
 * this component never gates trip completion.
 */
export function TripMap({
  pickup,
  dropoff,
  pickupLabel = "Pickup",
  dropoffLabel = "Drop-off",
  routeCoordinates = [],
  rider = null,
  routeUnavailable = false,
  height,
  compact = false,
}: Props) {
  const theme = useThemeName();
  const colors = useThemeColors();
  const frameRef = useRef<MapFrameHandle>(null);
  const readyRef = useRef(false);

  const model: MapModel = useMemo(
    () => ({
      theme: theme === "dark" ? "dark" : "light",
      pickup: isValidLatLng(pickup) ? pickup : null,
      dropoff: isValidLatLng(dropoff) ? dropoff : null,
      pickupLabel,
      dropoffLabel,
      routeCoordinates,
      routeColor: colors.actionYellow,
      rider: isValidLatLng(rider) ? rider : null,
      routeUnavailable,
    }),
    [
      theme,
      pickup,
      dropoff,
      pickupLabel,
      dropoffLabel,
      routeCoordinates,
      colors.actionYellow,
      rider,
      routeUnavailable,
    ],
  );

  // Initial HTML — rebuild when theme flips so tile set swaps cleanly.
  const html = useMemo(() => buildMapHtml(model), [model.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!readyRef.current) return;
    frameRef.current?.post(JSON.stringify(model));
  }, [model]);

  const hasStops = model.pickup || model.dropoff;

  return (
    <View
      className={
        compact
          ? "overflow-hidden rounded-card border border-outline"
          : "overflow-hidden rounded-card border border-outline bg-surface-variant"
      }
      style={height != null ? { height } : { minHeight: 220, flex: 1 }}
      accessibilityLabel="Trip map"
    >
      {hasStops ? (
        <MapFrame
          ref={frameRef}
          html={html}
          accessibilityLabel="Map showing pickup, drop-off, and route"
          onReady={() => {
            readyRef.current = true;
            frameRef.current?.post(JSON.stringify(model));
          }}
        />
      ) : (
        <View className="flex-1 items-center justify-center bg-surface-variant p-4">
          <Text className="text-center text-body text-text-secondary">
            No map for this job — the addresses below are what to follow.
          </Text>
        </View>
      )}
    </View>
  );
}
