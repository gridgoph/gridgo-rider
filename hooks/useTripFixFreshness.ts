import { useEffect, useState } from "react";

import type { Order } from "@/lib/api";
import { classifyLocation, type LocationFreshness } from "@/lib/locationFreshness";
import { locationAudience } from "@/lib/riderOrder";
import { useTripLocation } from "@/store/tripLocation";

/** Often enough that a fix crossing the 45 s stale line is said within seconds. */
export const FRESHNESS_TICK_MS = 5_000;

/**
 * How old the job's GPS fix is, re-read on a slow tick so the age moves while
 * the screen sits still. Null when no job is sharing location.
 */
export function useTripFixFreshness(trip: Order | null, enabled = true): LocationFreshness | null {
  const fixAtMs = useTripLocation((s) => s.fixAtMs);
  const permission = useTripLocation((s) => s.permission);
  const accuracy = useTripLocation((s) => s.accuracy);
  const audience = trip ? locationAudience(trip.state) : null;
  const active = enabled && audience != null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const handle = setInterval(() => setNow(Date.now()), FRESHNESS_TICK_MS);
    return () => clearInterval(handle);
  }, [active]);

  if (!active) return null;
  // A fix newer than the last tick is not "in the future": clamp to it.
  return classifyLocation({
    fixAtMs,
    nowMs: Math.max(now, fixAtMs ?? 0),
    permission,
    accuracyMetres: accuracy,
    audience,
  });
}

/** A fix that is stale or switched off is location trouble for the map's chip. */
export function fixNeedsAttention(freshness: LocationFreshness | null): boolean {
  return freshness?.level === "stale" || freshness?.level === "off";
}
