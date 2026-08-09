import * as Location from "expo-location";
import { useEffect, useState } from "react";

import type { LatLng } from "@/lib/geo";

type Args = {
  /** When false, permission is not requested and watching stops. */
  enabled?: boolean;
};

export type RiderLocationState = {
  coords: LatLng | null;
  accuracy: number | null;
  /**
   * Epoch ms of the fix these coordinates came from, so the UI can age them.
   * A position without its age cannot be labelled stale, and an unlabelled
   * stale position is a lie about where the rider is.
   */
  fixAtMs: number | null;
  permission: "unknown" | "granted" | "denied";
  error: string | null;
};

/**
 * Live device GPS for the map and location pings.
 * Coordinates stay in memory only — never written to storage.
 */
export function useRiderLocation({ enabled = true }: Args = {}): RiderLocationState {
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [fixAtMs, setFixAtMs] = useState<number | null>(null);
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied">(
    "unknown",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setCoords(null);
      setAccuracy(null);
      setFixAtMs(null);
      setError(null);
      return;
    }

    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      try {
        const current = await Location.getForegroundPermissionsAsync();
        let status = current.status;
        if (status !== Location.PermissionStatus.GRANTED) {
          const asked = await Location.requestForegroundPermissionsAsync();
          status = asked.status;
        }
        if (cancelled) return;

        if (status !== Location.PermissionStatus.GRANTED) {
          setPermission("denied");
          setError("Location permission is off. Enable it to show your position on the map.");
          return;
        }

        setPermission("granted");
        setError(null);

        // One immediate fix so the map is not blank while the watch warms up.
        try {
          const last = await Location.getLastKnownPositionAsync();
          if (!cancelled && last) {
            setCoords({
              lat: last.coords.latitude,
              lng: last.coords.longitude,
            });
            setAccuracy(last.coords.accuracy);
            // Age the cached fix from when it was taken, not from now — a
            // last-known position can be minutes old and must read as stale.
            setFixAtMs(last.timestamp ?? Date.now());
          }
        } catch {
          // ignore — watch will fill in
        }

        sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 8_000,
            distanceInterval: 15,
          },
          (pos) => {
            if (cancelled) return;
            // In-memory only — never AsyncStorage.
            setCoords({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
            setAccuracy(pos.coords.accuracy);
            setFixAtMs(pos.timestamp ?? Date.now());
          },
        );
      } catch {
        if (!cancelled) {
          setError("Could not read GPS. Trip actions still work.");
        }
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [enabled]);

  return { coords, accuracy, fixAtMs, permission, error };
}
