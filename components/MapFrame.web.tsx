import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import type { MapFrameHandle } from "@/components/MapFrame";

type Props = {
  html: string;
  onReady: () => void;
  accessibilityLabel: string;
  onMessage?: (raw: string) => void;
  interactive?: boolean;
};

/**
 * The same Leaflet document, in an iframe, for Expo web.
 *
 * `react-native-webview` has no web implementation and renders "React Native
 * WebView does not support this platform" in red, which is what every map on
 * this app's only screenshottable target used to say. The map document already
 * listens for `window.message`, so the model is pushed the same way it is on a
 * phone — same HTML, same tiles, same route.
 */
export const MapFrame = forwardRef<MapFrameHandle, Props>(function MapFrame(
  { html, onReady, accessibilityLabel, onMessage, interactive = true },
  ref,
) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useImperativeHandle(ref, () => ({
    post: (json: string) => {
      frameRef.current?.contentWindow?.postMessage(json, "*");
    },
  }));

  useEffect(() => {
    if (!onMessage) return;
    const handle = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (typeof event.data === "string") onMessage(event.data);
    };
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, [onMessage]);

  return createElement("iframe", {
    ref: frameRef,
    srcDoc: html,
    onLoad: onReady,
    title: accessibilityLabel,
    hidden: !interactive,
    tabIndex: interactive ? 0 : -1,
    // Hidden + no pointer events: an unfocused Leaflet iframe still sits
    // full-bleed over Active and swallows Browse offers taps on web.
    style: {
      border: "none",
      width: "100%",
      height: "100%",
      display: interactive ? "block" : "none",
      pointerEvents: interactive ? "auto" : "none",
      visibility: interactive ? "visible" : "hidden",
    },
  });
});
