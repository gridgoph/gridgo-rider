/**
 * Location while GRIDGO is not on screen.
 *
 * A rider spends most of a delivery in Google Maps or with the phone locked,
 * and the foreground watch stops the moment GRIDGO leaves the screen — which is
 * how a client watching a delivery saw the rider freeze (gridgo-api#217). So
 * for the length of a tracked job the phone runs a location service with a
 * visible notice, and its fixes are posted from `lib/tripLocationTask.ts`.
 *
 * The service is started with GRIDGO on screen, which is what lets it keep
 * running on "While using the app": Android treats a location foreground
 * service the rider started as in use, and iOS keeps updates the app started
 * running behind the blue indicator. It never runs outside a job, and it stops
 * when the job ends, the rider signs out, or the server refuses the job.
 *
 * Pure, so the rules are tested without a phone.
 */

import { STALE_FIX_MS } from "@/lib/locationFreshness";
import { LOCATION_PING_INTERVAL_MS } from "@/lib/riderOrder";

export const TRIP_LOCATION_TASK = "gridgo-trip-location";

/** The notice the phone shows for as long as the service runs. */
export const TRIP_LOCATION_NOTICE = {
  title: "GRIDGO is sharing your location",
  body: "Only during this job: the shop sees you until pick-up, then the client until delivery.",
} as const;

/** One fix as the service reports it. */
export type ServiceFix = {
  coords: { latitude: number; longitude: number; accuracy?: number | null };
  timestamp: number;
};

export type PickedFix = {
  lat: number;
  lng: number;
  accuracy: number | null;
  fixAtMs: number;
};

/** Leave a little room for timer jitter so a 15 s cadence is not read as 14.9. */
const CADENCE_SLACK_MS = 1_000;

/**
 * The one fix worth sending from a batch, or null.
 *
 * The phone can hand over a backlog after a stretch without signal. Only the
 * newest fix describes where the rider is, and only while it is fresh; an old
 * one replayed as current GPS would draw the rider where they were minutes
 * ago. Fixes closer together than the ping cadence are not sent, so a phone
 * reporting every second does not post every second.
 */
export function pickServiceFix(
  locations: readonly ServiceFix[] | null | undefined,
  { lastSentFixMs, nowMs }: { lastSentFixMs: number | null; nowMs: number },
): PickedFix | null {
  if (!locations?.length) return null;
  let newest: ServiceFix | null = null;
  for (const location of locations) {
    if (!Number.isFinite(location?.timestamp)) continue;
    if (!newest || location.timestamp > newest.timestamp) newest = location;
  }
  if (!newest) return null;
  const { latitude, longitude, accuracy } = newest.coords ?? {};
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const fixAtMs = newest.timestamp;
  if (nowMs - fixAtMs >= STALE_FIX_MS || fixAtMs > nowMs + 10_000) return null;
  if (lastSentFixMs != null && fixAtMs - lastSentFixMs < LOCATION_PING_INTERVAL_MS - CADENCE_SLACK_MS) return null;
  return {
    lat: latitude,
    lng: longitude,
    accuracy: typeof accuracy === "number" && accuracy >= 0 ? accuracy : null,
    fixAtMs,
  };
}

/**
 * Whether a refused ping means the job is no longer this rider's to track.
 *
 * `409 tracking_not_active` (the job left the sharing window), `403` (no
 * longer the assigned, approved rider) and `404` stop the service at once,
 * even with GRIDGO closed. A `401` is not a revocation — the next mint can
 * succeed — and a network failure is the road, so both keep it running.
 */
export function pingEndsTracking(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: unknown }).status;
  if (status === 403 || status === 404) return true;
  if (status !== 409) return false;
  const body = (error as { body?: unknown }).body;
  const code = body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : null;
  return code === "tracking_not_active";
}
