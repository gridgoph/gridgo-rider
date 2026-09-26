import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useRiderLocation } from "@/hooks/useRiderLocation";
import { useLocationSharing } from "@/hooks/useLocationSharing";
import { useActiveTrip } from "@/store/activeTrip";
import { useSession } from "@/store/session";
import { emptyTripLocation, useTripLocation } from "@/store/tripLocation";
import { accountHold } from "@/lib/accountHold";
import { approvalPresentation } from "@/lib/riderApproval";

/** Foreground trip tracking follows the authenticated delivery, never a tab. */
export function useTripTracking(): void {
  const user = useSession((s) => s.user);
  const trip = useActiveTrip((s) => s.order);
  const [foreground, setForeground] = useState(() => AppState.currentState !== "background" && AppState.currentState !== "inactive");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => setForeground(state === "active"));
    return () => sub.remove();
  }, []);
  const enabled = Boolean(user && !accountHold(user) && trip && trip.riderId === user.id && approvalPresentation(user).canWork && foreground);
  const location = useRiderLocation({enabled});
  const {sharing,lastError} = useLocationSharing({orderId:trip?.id ?? null,state:trip?.state ?? null,coords:location.coords,accuracy:location.accuracy,fixAtMs:location.fixAtMs,enabled});
  const {coords,accuracy,heading,speed,fixAtMs,permission,error} = location;
  useEffect(() => {
    useTripLocation.setState(enabled ? {coords,accuracy,heading,speed,fixAtMs,permission,error,sharing,sharingError:lastError} : {...emptyTripLocation,sharing:false,sharingError:null});
  }, [enabled,coords,accuracy,heading,speed,fixAtMs,permission,error,sharing,lastError]);
  useEffect(() => () => { useTripLocation.setState({...emptyTripLocation,sharing:false,sharingError:null}); }, []);
}
