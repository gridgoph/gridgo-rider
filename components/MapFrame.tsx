import { forwardRef, useImperativeHandle, useRef } from "react";
import { Platform } from "react-native";
import { WebView } from "react-native-webview";

import { useThemeColors } from "@/hooks/useTheme";

export type MapFrameHandle = {
  /** Push a new model into the already-loaded map document. */
  post: (json: string) => void;
};

type Props = {
  /** The whole Leaflet document, built by `lib/mapHtml.ts`. */
  html: string;
  /** Fired once the document is ready to receive a model. */
  onReady: () => void;
  accessibilityLabel: string;
};

/**
 * The container the Leaflet map lives in.
 *
 * Split out from `TripMap` for one reason: `react-native-webview` renders
 * nothing but a red error string on web, which turned every map on Expo web —
 * the only place this app can be screenshotted without a device — into a
 * failure notice. The web file next to this one draws the same document in an
 * iframe. The map stack itself is untouched: Leaflet, OpenStreetMap tiles and
 * OSRM routing, exactly as before.
 */
export const MapFrame = forwardRef<MapFrameHandle, Props>(function MapFrame(
  { html, onReady, accessibilityLabel },
  ref,
) {
  const colors = useThemeColors();
  const webRef = useRef<WebView>(null);

  useImperativeHandle(ref, () => ({
    post: (json: string) => {
      webRef.current?.injectJavaScript(`try { applyModel(${json}); } catch (e) {} true;`);
    },
  }));

  return (
    <WebView
      ref={webRef}
      originWhitelist={["*"]}
      source={{ html, baseUrl: "https://localhost" }}
      onLoadEnd={onReady}
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
      accessibilityLabel={accessibilityLabel}
    />
  );
});
