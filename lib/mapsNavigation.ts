import { Linking, Platform } from "react-native";

import { isValidLatLng, type LatLng } from "@/lib/geo";

/**
 * Handing the ride to the rider's own navigation app.
 *
 * No paid map service and no favourite app: the phone's neutral hand-off goes
 * first, so the rider picks Google Maps, Waze, or whatever they ride with.
 * Android takes a `geo:` intent (its own app chooser); iOS takes `maps:`, the
 * system's directions handler. Google Maps on the web is the last fallback,
 * used only when no app on the phone answers — it is a free link, no key and
 * no billing. Always the exact pin, never a label an app could geocode elsewhere.
 */

/** Google Maps web directions: the fallback only. */
export function googleMapsDirectionsUrl(point: LatLng | null): string | null {
  if (!isValidLatLng(point)) return null;
  const destination = encodeURIComponent(`${point.lat},${point.lng}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}

export type NavigationHandoff = {
  /** The platform's neutral hand-off, tried first. */
  primary: string;
  /** Opened only when nothing on the phone answers the primary. */
  fallback: string;
};

export function navigationHandoff(point: LatLng | null, platform: string = Platform.OS): NavigationHandoff | null {
  const fallback = googleMapsDirectionsUrl(point);
  if (!fallback || !point) return null;
  const pin = `${point.lat},${point.lng}`;
  if (platform === "android") return { primary: `geo:${pin}?q=${encodeURIComponent(pin)}`, fallback };
  if (platform === "ios") return { primary: `maps:?daddr=${encodeURIComponent(pin)}&dirflg=d`, fallback };
  // A browser has no app to hand to.
  return { primary: fallback, fallback };
}

/** Open the hand-off; rejects only when neither the app nor the fallback opened. */
export async function openNavigation(handoff: NavigationHandoff): Promise<void> {
  try {
    await Linking.openURL(handoff.primary);
  } catch (error) {
    if (handoff.fallback === handoff.primary) throw error;
    await Linking.openURL(handoff.fallback);
  }
}
