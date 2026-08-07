import { useEffect, useMemo, useRef } from "react";
import { Platform, Text, View } from "react-native";
import { WebView } from "react-native-webview";

import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import type { LatLng } from "@/lib/geo";
import { isValidLatLng } from "@/lib/geo";
import { buildMapHtml, type MapModel } from "@/lib/mapHtml";
import type { LonLat } from "@/lib/geo";

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
 * Leaflet map over OpenStreetMap tiles, rendered in a WebView.
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
  const webRef = useRef<WebView>(null);
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
    if (!readyRef.current || !webRef.current) return;
    const payload = JSON.stringify(model);
    // Both iOS and Android WebView accept injectJavaScript.
    webRef.current.injectJavaScript(
      `try { applyModel(${payload}); } catch (e) {} true;`,
    );
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
        <WebView
          ref={webRef}
          originWhitelist={["*"]}
          source={{ html, baseUrl: "https://localhost" }}
          onLoadEnd={() => {
            readyRef.current = true;
            const payload = JSON.stringify(model);
            webRef.current?.injectJavaScript(
              `try { applyModel(${payload}); } catch (e) {} true;`,
            );
          }}
          style={{ flex: 1, backgroundColor: colors.surfaceVariant }}
          // Map gestures should not fight the parent ScrollView on Android.
          nestedScrollEnabled
          scrollEnabled={false}
          overScrollMode="never"
          setSupportMultipleWindows={false}
          javaScriptEnabled
          domStorageEnabled
          // Allow OSM / Leaflet CDN and tile hosts.
          mixedContentMode="compatibility"
          // Keep Android hardware layer for smoother pan.
          androidLayerType={Platform.OS === "android" ? "hardware" : undefined}
          accessibilityLabel="Map showing pickup, drop-off, and route"
        />
      ) : (
        <View className="flex-1 items-center justify-center bg-surface-variant p-4">
          <Text className="text-center text-body text-text-secondary">
            Map coordinates are not available for this job. Use the addresses
            below.
          </Text>
        </View>
      )}
    </View>
  );
}
