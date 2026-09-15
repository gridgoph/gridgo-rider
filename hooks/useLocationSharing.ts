import { STALE_FIX_MS } from "@/lib/locationFreshness";
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
  fixAtMs: number | null;
  /** When false, the hook never starts (e.g. app backgrounded). */
  enabled?: boolean;
};

/**
 * Posts periodic location pings while a trip is in transit.
 *
 * - Explicit UI (LocationSharingBanner) must show when `sharing` is true.
 * - Sharing stops the moment the trip leaves picked_up / out_for_delivery.
 * - Coordinates are never persisted; the root tracking owner shares them in memory.
 * - Sends each fresh fix once with its capture time; sharing becomes true only after a successful ping.
 */
export function useLocationSharing({
  orderId,
  state,
  coords,
  accuracy = null,
  fixAtMs,
  enabled = true,
}: Args) {
  const [sharing, setSharing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const orderIdRef = useRef(orderId);
  const stateRef = useRef(state);
  const coordsRef = useRef(coords);
  const accuracyRef = useRef(accuracy);
  const fixRef = useRef(fixAtMs);
  fixRef.current = fixAtMs;
  orderIdRef.current = orderId;
  stateRef.current = state;
  coordsRef.current = coords;
  accuracyRef.current = accuracy;

  const hasCoords = coords != null;
  useEffect(() => {
    const active =
      enabled &&
      Boolean(orderId) &&
      Boolean(state) &&
      shouldShareLocation(state ?? "");

    setSharing(false);
    if (!active) {
      setLastError(null);
      return;
    }

    let cancelled = false;
    let inFlight = false;
    let sentFix: number | null = null;

    async function pingOnce() {
      const id = orderIdRef.current;
      const tripState = stateRef.current;
      const point = coordsRef.current;
      const fix = fixRef.current;
      if (cancelled || inFlight || !id || !shouldShareLocation(tripState ?? "") || !point) return;
      if (fix == null || !Number.isFinite(fix) || Date.now() - fix >= STALE_FIX_MS || fix > Date.now() + 10_000) {
        setSharing(false);
        return;
      }
      if (sentFix === fix) return;
      inFlight = true;
      try {
        // Live coords only — never persist.
        await api.postLocation(id, {
          lat: point.lat,
          lng: point.lng,
          accuracy: accuracyRef.current ?? null,
          recordedAt: new Date(fix).toISOString(),
        });
        sentFix = fix;
        if (!cancelled) { setLastError(null); setSharing(true); }
      } catch (e) {
        if (!cancelled) {
          setLastError(api.apiErrorMessage(e, "Location ping failed."));
          setSharing(false);
        }
      } finally { inFlight = false; }
    }

    void pingOnce();
    const handle = setInterval(() => {
      void pingOnce();
    }, LOCATION_PING_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(handle);
      // Sharing ends with the effect teardown — trip ended or foreground tracking disabled.
      setSharing(false);
    };
  }, [orderId, state, enabled, hasCoords]);

  return { sharing, lastError };
}
