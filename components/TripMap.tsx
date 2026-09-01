import { Maximize2 } from "lucide-react-native";
import { useEffect, useMemo, useRef } from "react";
import { Pressable, Text, View } from "react-native";

import { MapFrame, type MapFrameHandle } from "@/components/MapFrame";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import { isValidLatLng, type LatLng, type LonLat } from "@/lib/geo";
import { buildMapHtml, type MapModel, type MapPinKind } from "@/lib/mapHtml";

type Props = {
  pickup: LatLng | null;
  dropoff: LatLng | null;
  pickupLabel?: string;
  dropoffLabel?: string;
  pickupKind?: MapPinKind;
  dropoffKind?: MapPinKind;
  focus?: "pickup" | "dropoff" | null;
  /** GeoJSON [lon, lat] route coordinates. */
  routeCoordinates?: LonLat[];
  rider?: LatLng | null;
  riderAccuracy?: number | null;
  /** Course in degrees, or null while stopped — the map draws a dot then. */
  riderHeading?: number | null;
  navTitle?: string | null;
  navSummary?: string | null;
  /**
   * Status-bar height to keep the on-map banner clear of, in pixels.
   *
   * Only the full-screen map needs it: inside a page the map has a header above
   * it and nothing of the phone's own is drawn over it.
   */
  safeTop?: number;
  routeUnavailable?: boolean;
  /** Fixed height for offer cards; omit for flex fill on Active. */
  height?: number;
  /** Compact mode for list cards. */
  compact?: boolean;
  /**
   * Turns the map into a preview with one expand control.
   *
   * A map on a scrolling page cannot really be driven — the page claims the
   * drag, and a rider trying to look one street ahead scrolls the job instead.
   * So the card shows the trip and hands over the one gesture that helps:
   * expand, and read it where the gesture is unambiguous.
   */
  onExpand?: () => void;
  /**
   * How far in from the left edge the map's own overlays must start.
   *
   * A screen that draws its own control over this map says so, or the map
   * draws the heading strip straight underneath it.
   */
  chromeLeft?: number;
};

/**
 * Leaflet map over OpenStreetMap (light) and Carto (dark) tiles.
 *
 * Attribution is always visible (licence). When tiles fail to load the
 * surrounding addresses and actions still work — this component never gates
 * trip completion.
 */
/*
  The expand control's footprint, so the map starts its heading strip beside it
  rather than underneath: the card's 8px inset, the 44px control, and 8px of
  air. It sits in the same corner as the full-screen map's close control, so
  one corner opens the map and the same corner closes it again.
*/
const CARD_CHROME_LEFT = 8 + 44 + 8;

export function TripMap({
  pickup,
  dropoff,
  pickupLabel = "Pickup",
  dropoffLabel = "Drop-off",
  pickupKind = "shop",
  dropoffKind = "client",
  focus = null,
  routeCoordinates = [],
  rider = null,
  riderAccuracy = null,
  riderHeading = null,
  navTitle = null,
  navSummary = null,
  safeTop = 0,
  routeUnavailable = false,
  height,
  compact = false,
  onExpand,
  chromeLeft,
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
      pickupKind,
      dropoffKind,
      focus,
      routeCoordinates,
      routeColor: colors.actionYellow,
      rider: isValidLatLng(rider) ? rider : null,
      riderAccuracy,
      riderHeading,
      navTitle,
      navSummary,
      safeTop,
      routeUnavailable,
      // A card keeps its zoom — a button tap and a pinch cost the page
      // nothing — and gives up only the drag the page itself needs.
      pan: !onExpand,
      zoom: true,
      chromeLeft: chromeLeft ?? (onExpand ? CARD_CHROME_LEFT : null),
    }),
    [
      theme,
      pickup,
      dropoff,
      pickupLabel,
      dropoffLabel,
      pickupKind,
      dropoffKind,
      focus,
      routeCoordinates,
      colors.actionYellow,
      rider,
      riderAccuracy,
      riderHeading,
      navTitle,
      navSummary,
      safeTop,
      routeUnavailable,
      onExpand,
      chromeLeft,
    ],
  );

  // Initial HTML — rebuild when theme flips so tile set swaps cleanly.
  const html = useMemo(() => buildMapHtml(model), [model.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!readyRef.current) return;
    frameRef.current?.post(JSON.stringify(model));
  }, [model]);

  const hasStops = model.pickup || model.dropoff || model.rider;

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
        <>
          <View className="flex-1">
            <MapFrame
              ref={frameRef}
              html={html}
              accessibilityLabel="Map showing pickup, drop-off, and route"
              onReady={() => {
                readyRef.current = true;
                frameRef.current?.post(JSON.stringify(model));
              }}
            />
          </View>

          {/*
            Top left, the corner the full-screen map puts its close control in,
            so the same corner opens the map and closes it again. The bottom
            right belongs to the map's own zoom and the licence line.
          */}
          {onExpand ? (
            <Pressable
              onPress={onExpand}
              accessibilityRole="button"
              accessibilityLabel="Open the map full screen"
              hitSlop={8}
              className="gg-touch absolute left-2 top-2 h-11 w-11 items-center justify-center rounded-pill border border-outline"
              style={({ pressed }) => ({
                backgroundColor: colors.surface,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Maximize2 size={18} color={colors.textPrimary} strokeWidth={2.25} />
            </Pressable>
          ) : null}
        </>
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
