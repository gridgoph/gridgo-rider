import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

/**
 * Whether this rider has gone online on this phone.
 *
 * Presentation only: gridgo-api registers no dispatch presence
 * (`docs/RIDER_MAP_HOME_API.md`, "Offer pool and rotation"), so the server
 * offers jobs whatever this says. Online shows the offer over the map; offline
 * keeps the map quiet and says when an offer is waiting rather than hiding it.
 * Remembered per account, so a relaunch mid-shift stays online.
 */

export const RIDER_ONLINE_STORAGE_KEY = "gridgo.riderOnline.v1";

type RiderOnlineState = {
  /** Account id → online. */
  online: Record<string, boolean>;
  hydrated: boolean;
};

export const useRiderOnline = create<RiderOnlineState>(() => ({ online: {}, hydrated: false }));

let hydration: Promise<void> | null = null;

export function parseRiderOnline(raw: string | null): Record<string, boolean> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(
        (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
      ),
    );
  } catch {
    return {};
  }
}

export function hydrateRiderOnline(): Promise<void> {
  hydration ??= AsyncStorage.getItem(RIDER_ONLINE_STORAGE_KEY)
    .then((raw) => {
      // A switch flipped before storage answered wins over the stored value.
      useRiderOnline.setState((s) => ({ online: { ...parseRiderOnline(raw), ...s.online } }));
    })
    .catch(() => {
      // Storage that will not answer starts the shift offline, never stuck.
    })
    .finally(() => useRiderOnline.setState({ hydrated: true }));
  return hydration;
}

export function setRiderOnline(userId: string, online: boolean): void {
  const next = { ...useRiderOnline.getState().online, [userId]: online };
  useRiderOnline.setState({ online: next });
  AsyncStorage.setItem(RIDER_ONLINE_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
}

/** Online for this account; offline for anyone signed out or never switched on. */
export function useIsRiderOnline(userId: string | null): boolean {
  return useRiderOnline((s) => Boolean(userId && s.online[userId]));
}

/** Test seam: forget the hydration promise. */
export function resetRiderOnlineForTests(): void {
  hydration = null;
  useRiderOnline.setState({ online: {}, hydrated: false });
}
