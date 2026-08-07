import { useEffect, useRef, useState } from "react";

import * as api from "@/lib/api";
import {
  DEMO_LOCATION_PING,
  LOCATION_PING_INTERVAL_MS,
  shouldShareLocation,
} from "@/lib/riderOrder";

type Args = {
  orderId: string | null;
  state: string | null;
  /** When false, the hook never starts (e.g. screen unfocused). */
  enabled?: boolean;
};

/**
 * Posts periodic demo location pings while a trip is in transit.
 *
 * - Explicit UI (LocationSharingBanner) must show when `sharing` is true.
 * - Sharing stops the moment the trip leaves picked_up / out_for_delivery.
 * - Coordinates are never written to AsyncStorage or any other store.
 * - Uses fixed Davao demo coordinates — no GPS library (MVP).
 */
export function useLocationSharing({ orderId, state, enabled = true }: Args) {
  const [sharing, setSharing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  // Keep the latest values without restarting the interval on every render.
  const orderIdRef = useRef(orderId);
  const stateRef = useRef(state);
  orderIdRef.current = orderId;
  stateRef.current = state;

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
      if (!id || !shouldShareLocation(tripState ?? "")) return;
      try {
        // Demo coords only — never persist.
        await api.postLocation(id, { ...DEMO_LOCATION_PING });
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
  }, [orderId, state, enabled]);

  return { sharing, lastError };
}
