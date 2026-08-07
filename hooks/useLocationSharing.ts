import { useEffect, useRef, useState } from "react";

import * as api from "@/lib/api";
import type { LatLng } from "@/lib/geo";
import {
  LOCATION_PING_INTERVAL_MS,
  shouldShareLocation,
} from "@/lib/riderOrder";

type Args = {
  orderId: string | null;
  state: string | null;
  /** Live GPS from useRiderLocation — never from storage. */
  coords: LatLng | null;
  accuracy?: number | null;
  /** When false, the hook never starts (e.g. screen unfocused). */
  enabled?: boolean;
};

/**
 * Posts periodic location pings while a trip is in transit.
 *
 * - Explicit UI (LocationSharingBanner) must show when `sharing` is true.
 * - Sharing stops the moment the trip leaves picked_up / out_for_delivery.
 * - Coordinates are never written to AsyncStorage or any other store.
 * - Uses live GPS when available; skips the ping if GPS is not ready yet.
 */
export function useLocationSharing({
  orderId,
  state,
  coords,
  accuracy = null,
  enabled = true,
}: Args) {
  const [sharing, setSharing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const orderIdRef = useRef(orderId);
  const stateRef = useRef(state);
  const coordsRef = useRef(coords);
  const accuracyRef = useRef(accuracy);
  orderIdRef.current = orderId;
  stateRef.current = state;
  coordsRef.current = coords;
  accuracyRef.current = accuracy;

  useEffect(() => {
    const active =
      enabled &&
      Boolean(orderId) &&
      Boolean(state) &&
      shouldShareLocation(state ?? "");

    setSharing(active);
    if (!active) {
      setLastError(null);
      return;
    }

    let cancelled = false;

    async function pingOnce() {
      const id = orderIdRef.current;
      const tripState = stateRef.current;
      const point = coordsRef.current;
      if (!id || !shouldShareLocation(tripState ?? "") || !point) return;
      try {
        // Live coords only — never persist.
        await api.postLocation(id, {
          lat: point.lat,
          lng: point.lng,
          accuracy: accuracyRef.current ?? null,
        });
        if (!cancelled) setLastError(null);
      } catch (e) {
        if (!cancelled) {
          setLastError(api.apiErrorMessage(e, "Location ping failed."));
        }
      }
    }

    void pingOnce();
    const handle = setInterval(() => {
      void pingOnce();
    }, LOCATION_PING_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(handle);
      // Sharing ends with the effect teardown — trip ended or screen left.
      setSharing(false);
    };
  }, [orderId, state, enabled, coords != null]);

  return { sharing, lastError };
}
