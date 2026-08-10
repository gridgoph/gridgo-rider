import { useMemo } from "react";

import { riderAction, type RiderAction } from "@/lib/riderAction";
import { approvalPresentation } from "@/lib/riderApproval";
import { tripPhase, type TripPhase } from "@/lib/riderOrder";
import { useActiveTrip } from "@/store/activeTrip";
import { useSession } from "@/store/session";

export type RiderActionState = {
  action: RiderAction;
  phase: TripPhase;
  orderId: string | null;
};

/**
 * The next step of the job in hand, wherever the rider is in the app.
 *
 * Both the raised centre disc and the Active screen read this, so the disc and
 * the screen's own button can never disagree about what happens next.
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
