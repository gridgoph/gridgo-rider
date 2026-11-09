import { useEffect } from "react";
import { AppState } from "react-native";

import { currentRiderBuild } from "@/lib/appIdentity";
import { custodyStepNeedsUpdate, knowsHandoverFlow, updateBlock } from "@/lib/minimumBuild";
import { useActiveTrip } from "@/store/activeTrip";
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
 * rider's trip counts as in hand until a trip read says otherwise: while it is
 * still loading, and after a read that failed (a 5xx or a lost connection is
 * not "no job"), the trip, its chat and the read's own Try again stay usable.
 */
export function useUpdateBlock(): "full" | "steps" | null {
  const required = useUpdateRequired(updateRequired);
  const signedIn = useSession((s) => isSignedIn(s.user));
  const tripInHand = useActiveTrip((s) => Boolean(s.order) || !s.loaded || s.readFailed);
  return updateBlock({ updateRequired: required, tripInHand: signedIn && tripInHand });
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
