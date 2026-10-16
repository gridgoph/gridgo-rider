import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useRiderLocation } from "@/hooks/useRiderLocation";
import { useLocationSharing } from "@/hooks/useLocationSharing";
import { useActiveTrip } from "@/store/activeTrip";
import { useSession } from "@/store/session";
import { emptyTripLocation, useTripLocation } from "@/store/tripLocation";
import { accountHold } from "@/lib/accountHold";
import { approvalPresentation } from "@/lib/riderApproval";
import { shouldShareLocation } from "@/lib/riderOrder";
import { setTripLocationTarget, startTripLocationUpdates, stopTripLocationUpdates } from "@/lib/tripLocationTask";

/**
 * Trip tracking follows the authenticated delivery, never a tab.
 *
 * On screen, the GPS watch feeds the map and `useLocationSharing` posts. Off
 * screen, the background service in `lib/tripLocationTask.ts` posts instead,
 * for exactly the tracked window (acceptance to delivery) — started while
 * GRIDGO is visible, stopped the moment the job ends, the account is held or
 * the rider signs out.
 */
export function useTripTracking(): void {
  const user = useSession((s) => s.user);
  const trip = useActiveTrip((s) => s.order);
  const [foreground, setForeground] = useState(() => AppState.currentState !== "background" && AppState.currentState !== "inactive");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => setForeground(state === "active"));
    return () => sub.remove();
  }, []);
  const mine = Boolean(user && !accountHold(user) && trip && trip.riderId === user.id && approvalPresentation(user).canWork);
  const enabled = mine && foreground;
  const tracked = mine && Boolean(trip) && shouldShareLocation(trip?.state ?? "");
  const location = useRiderLocation({enabled});
  const {sharing,lastError} = useLocationSharing({orderId:trip?.id ?? null,state:trip?.state ?? null,coords:location.coords,accuracy:location.accuracy,fixAtMs:location.fixAtMs,enabled});
  const {coords,accuracy,heading,speed,fixAtMs,permission,error} = location;
  useEffect(() => {
    useTripLocation.setState(enabled ? {coords,accuracy,heading,speed,fixAtMs,permission,error,sharing,sharingError:lastError} : {...emptyTripLocation,sharing:false,sharingError:null});
  }, [enabled,coords,accuracy,heading,speed,fixAtMs,permission,error,sharing,lastError]);
  useEffect(() => () => { useTripLocation.setState({...emptyTripLocation,sharing:false,sharingError:null}); }, []);

  const orderId = tracked ? trip?.id ?? null : null;
  useEffect(() => {
    if (!orderId) {
      setTripLocationTarget(null);
      void stopTripLocationUpdates();
      return;
    }
    setTripLocationTarget({ orderId });
    // The phone only lets the service start while GRIDGO is on screen, and
    // only once location is allowed; a later return to the app retries.
    if (foreground && permission === "granted") void startTripLocationUpdates();
  }, [orderId, foreground, permission]);
  useEffect(() => () => {
    setTripLocationTarget(null);
    void stopTripLocationUpdates();
  }, []);
}
