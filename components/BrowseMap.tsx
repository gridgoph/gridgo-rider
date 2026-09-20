import { useEffect, useMemo, useRef } from "react";
import { View } from "react-native";

import { MapFrame, type MapFrameHandle } from "@/components/MapFrame";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import { parseBrowseMapMessage } from "@/lib/browseMap";
import { isValidLatLng, type LatLng } from "@/lib/geo";
import { buildMapHtml, type MapModel, type MapPlace, type MapView } from "@/lib/mapHtml";

type Props = {
  places: readonly MapPlace[];
  selectedPlaceId?: string | null;
  rider?: LatLng | null;
  /** Course in degrees, or null while stopped — a dot is drawn then. */
  riderHeading?: number | null;
  view?: MapView | null;
  onSelectPlace?: (id: string) => void;
  /**
   * False while another tab is showing. The Leaflet iframe is a compositor
   * surface and keeps eating clicks on Active after you leave Map.
   */
  interactive?: boolean;
};

/**
 * Full-bleed city map: OpenStreetMap tiles, shop plates, the rider, no route.
 *
 * Same Leaflet document as `TripMap`. This one always draws — an empty
 * directory is still a map of Davao, not a missing-job placeholder.
 */
export function BrowseMap({
  places,
  selectedPlaceId = null,
  rider = null,
  riderHeading = null,
  view = null,
  onSelectPlace,
  interactive = true,
}: Props) {
  const theme = useThemeName();
  const colors = useThemeColors();
  const frameRef = useRef<MapFrameHandle>(null);
  const readyRef = useRef(false);

  const model: MapModel = useMemo(
    () => ({
      theme: theme === "dark" ? "dark" : "light",
      pickup: null,
      dropoff: null,
      pickupLabel: "",
      dropoffLabel: "",
      routeCoordinates: [],
      routeColor: colors.actionYellow,
      rider: isValidLatLng(rider) ? rider : null,
      riderHeading,
      routeUnavailable: false,
      places,
      selectedPlaceId,
      view,
    }),
    [theme, colors.actionYellow, rider, riderHeading, places, selectedPlaceId, view],
  );

  const html = useMemo(() => buildMapHtml(model), [model.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!readyRef.current) return;
    frameRef.current?.post(JSON.stringify(model));
  }, [model]);

  return (
    <View className="flex-1" accessibilityLabel="City map">
      <MapFrame
        ref={frameRef}
        html={html}
        interactive={interactive}
        accessibilityLabel="Map of Davao with supplier placeholders"
        onReady={() => {
          readyRef.current = true;
          frameRef.current?.post(JSON.stringify(model));
        }}
        onMessage={(raw) => {
          const tap = parseBrowseMapMessage(raw);
          if (tap) onSelectPlace?.(tap.id);
        }}
      />
    </View>
  );
}
