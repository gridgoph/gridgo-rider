import { useMemo } from "react";

import { riderAction, type RiderAction } from "@/lib/riderAction";
import { approvalPresentation } from "@/lib/riderApproval";
import { tripPhase, type TripPhase } from "@/lib/riderOrder";
import { useActiveTrip } from "@/store/activeTrip";
import { useSession } from "@/store/session";

export type RiderActionState = {
  /** `null` while Operations is still deciding: there is no next step to offer. */
  action: RiderAction | null;
  phase: TripPhase;
  orderId: string | null;
};

/**
 * The next step of the job in hand, wherever the rider is in the app.
 *
 * Active reads this so the trip's next-step button and the status chip stay
 * on the same phase. Finding work is Offers, not a tab-bar action.
 */
export function useRiderAction(): RiderActionState {
  const order = useActiveTrip((s) => s.order);
  const user = useSession((s) => s.user);

  return useMemo(() => {
    const phase = tripPhase(order);
    const { canWork } = approvalPresentation(user);
    return {
      phase,
      orderId: order?.id ?? null,
      action: riderAction(phase, order?.id ?? null, canWork),
    };
  }, [order, user]);
}
