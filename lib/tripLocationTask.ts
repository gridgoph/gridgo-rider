import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { AppState, Platform } from "react-native";

import { colors } from "@/constants/theme";
import * as api from "@/lib/api";
import {
  pickServiceFix,
  pingEndsTracking,
  TRIP_LOCATION_NOTICE,
  TRIP_LOCATION_TASK,
  type ServiceFix,
} from "@/lib/backgroundLocation";
import { LOCATION_PING_INTERVAL_MS } from "@/lib/riderOrder";

/**
 * The background location service for a tracked job.
 *
 * `hooks/useTripTracking.ts` names the job (`setTripLocationTarget`) and
 * starts or stops the service; this module defines the task the phone calls
 * with new fixes. Rules live in `lib/backgroundLocation.ts`.
 *
 * While GRIDGO is on screen the foreground watch and `useLocationSharing`
 * already post, so the task stays quiet then rather than doubling the pings.
 * Coordinates are never stored: a fix goes from the phone to the server and is
 * forgotten. The target is memory only too, so a GRIDGO process that comes
 * back without its screen — and so without a signed-in session to post with —
 * stops the service instead of running it for nobody.
 */

type Target = { orderId: string };

let target: Target | null = null;
let lastSentFixMs: number | null = null;
let inFlight = false;

/** Which job the service posts for. Null ends posting at once. */
export function setTripLocationTarget(next: Target | null): void {
  if (next?.orderId !== target?.orderId) lastSentFixMs = null;
  target = next;
}

function supported(): boolean {
  return Platform.OS === "android" || Platform.OS === "ios";
}

/** The phone delivered fixes. Exported for tests; the task calls it. */
export async function handleServiceFixes(
  locations: readonly ServiceFix[] | null | undefined,
  nowMs: number = Date.now(),
): Promise<void> {
  const current = target;
  if (!current) {
    void stopTripLocationUpdates();
    return;
  }
  if (AppState.currentState === "active" || inFlight) return;
  const fix = pickServiceFix(locations, { lastSentFixMs, nowMs });
  if (!fix) return;
  inFlight = true;
  try {
    await api.postLocation(current.orderId, {
      lat: fix.lat,
      lng: fix.lng,
      accuracy: fix.accuracy,
      recordedAt: new Date(fix.fixAtMs).toISOString(),
    });
    if (target?.orderId === current.orderId) lastSentFixMs = fix.fixAtMs;
  } catch (error) {
    if (pingEndsTracking(error) && target?.orderId === current.orderId) {
      target = null;
      await stopTripLocationUpdates();
    }
  } finally {
    inFlight = false;
  }
}

// The task has to be defined when the bundle loads, before the phone can
// deliver a fix to it — not inside a component.
if (supported()) {
  try {
    TaskManager.defineTask<{ locations?: ServiceFix[] }>(TRIP_LOCATION_TASK, async ({ data, error }) => {
      if (error) return;
      await handleServiceFixes(data?.locations);
    });
  } catch {
    // Expo Go or a build without the module: background sharing is simply off.
  }
}

/**
 * Start the service for the current job, if it is not running already.
 *
 * Must be called with GRIDGO on screen: Android refuses to start a location
 * service from the background, and that start is what lets it keep running on
 * "While using the app". Resolves false when the phone would not start it.
 */
export async function startTripLocationUpdates(): Promise<boolean> {
  if (!supported()) return false;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK)) return true;
    await Location.startLocationUpdatesAsync(TRIP_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: LOCATION_PING_INTERVAL_MS,
      // Zero, so a rider waiting at the counter or in traffic still sends a
      // fresh fix every interval instead of going stale for standing still.
      distanceInterval: 0,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.OtherNavigation,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: TRIP_LOCATION_NOTICE.title,
        notificationBody: TRIP_LOCATION_NOTICE.body,
        notificationColor: colors.light.actionYellow,
        // Closing GRIDGO from recent apps ends sharing, as the card says.
        killServiceOnDestroy: true,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/** Stop the service. Safe to call when it is not running. */
export async function stopTripLocationUpdates(): Promise<void> {
  if (!supported()) return;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(TRIP_LOCATION_TASK);
    }
  } catch {
    // Not running, or no module to ask. Either way nothing is being shared.
  }
}
