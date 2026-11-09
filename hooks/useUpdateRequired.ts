import { useEffect } from "react";
import { AppState } from "react-native";

import { currentRiderBuild } from "@/lib/appIdentity";
import { custodyStepNeedsUpdate, knowsHandoverFlow, updateBlock } from "@/lib/minimumBuild";
import { tripProvedIdle, useActiveTrip } from "@/store/activeTrip";
import { isSignedIn, useSession } from "@/store/session";
import {
  bindUpdateRequiredHandler,
  checkMinimumBuild,
  markUnknownHandoverFlow,
  updateRequired,
  useUpdateRequired,
} from "@/store/updateRequired";

/**
 * Read the published minimum at launch and on every return to the
 * foreground, and hear every `426 app_update_required`. Mounted once, from
 * the root shell, signed in or out: an old build has to be replaceable by
 * someone who cannot sign in to it.
 */
export function useMinimumBuildCheck(): void {
  useEffect(() => bindUpdateRequiredHandler(), []);

  useEffect(() => {
    const installed = currentRiderBuild();
    void checkMinimumBuild(installed);
    if (!installed) return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void checkMinimumBuild(installed);
    });
    return () => sub.remove();
  }, []);
}

/**
 * How much of the app the update takes right now (`updateBlock`). A signed-in
 * rider's trip counts as in hand unless a current, successful, idle trip read
 * proves otherwise (`tripProvedIdle`, the same guard the Play restart prompt
 * uses). A read still pending, one that failed, a foreground return or an
 * offer acceptance not yet reconciled are all uncertainty, so the trip, its
 * chat and the read's own Try again stay usable. Signed out there is no trip.
 */
export function useUpdateBlock(): "full" | "steps" | null {
  const required = useUpdateRequired(updateRequired);
  const signedIn = useSession((s) => isSignedIn(s.user));
  const riderId = useSession((s) => s.user?.id ?? null);
  const provedIdle = useActiveTrip((s) => tripProvedIdle(s, riderId));
  return updateBlock({ updateRequired: required, tripInHand: signedIn && !provedIdle });
}

/** Whether this build is too old for a `rider_packs` step (`custodyStepNeedsUpdate`). */
export function useUpdateRequiredFlag(): boolean {
  return useUpdateRequired(updateRequired);
}

/**
 * Whether this custody screen shows the update instead of its step
 * (`custodyStepNeedsUpdate`). A flow this build does not know is also noted,
 * so the whole app asks for the update once the trip is done.
 */
export function useCustodyNeedsUpdate(order: { handoverFlow?: unknown } | null): boolean {
  const required = useUpdateRequiredFlag();
  const unknownFlow = Boolean(order) && !knowsHandoverFlow(order?.handoverFlow);
  useEffect(() => {
    if (unknownFlow) markUnknownHandoverFlow();
  }, [unknownFlow]);
  return custodyStepNeedsUpdate(order, required);
}
