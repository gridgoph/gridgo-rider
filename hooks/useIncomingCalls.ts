import { useRouter, type Href } from "expo-router";
import { useEffect } from "react";

import { accountHold } from "@/lib/accountHold";
import * as api from "@/lib/api";
import { subscribeLive } from "@/lib/live";
import { callWindow, ringingIncoming } from "@/lib/orderCalls";
import { approvalPresentation } from "@/lib/riderApproval";
import { useActiveTrip } from "@/store/activeTrip";
import { useCall } from "@/store/call";
import { useSession } from "@/store/session";

/** The call screen. Typed loosely: generated route types lag a new route until Metro runs. */
export const CALL_ROUTE = "/call" as Href;

/**
 * Rings this phone when the client or the shop calls, while the app is open.
 *
 * Mounted once, from the root layout, beside the alert stream it listens to.
 * The stream's `calls` pointer names the order; anything broader (a reconnect,
 * the 30-second fallback, a push landing in the foreground) re-checks the trip
 * in hand. Either way the call list is read from the API and only a call that
 * is still ringing, is not this rider's own, and is inside its deadline rings
 * (`ringingIncoming`). The store remembers what it rang for, so a repeated
 * pointer or a late push never rings the same call twice.
 *
 * With the app in the background the `order_call_incoming` push does this job
 * instead and opens the call screen, which runs the same check.
 */
export function useIncomingCalls(): void {
  const router = useRouter();

  const userId = useSession((s) => s.user?.id ?? null);
  const canWork = useSession((s) => approvalPresentation(s.user).canWork && accountHold(s.user) == null);

  // A different account never inherits a call, ringing or live.
  useEffect(() => () => useCall.getState().reset(), [userId]);

  useEffect(() => {
    if (!userId || !canWork) return;
    let stopped = false;
    const checking = new Set<string>();

    async function check(orderId: string) {
      if (checking.has(orderId)) return;
      checking.add(orderId);
      try {
        const ringing = ringingIncoming(await api.listOrderCalls(orderId), Date.now());
        if (stopped || !ringing) return;
        if (useCall.getState().receive(ringing) && !useCall.getState().screenOpen) router.push(CALL_ROUTE);
      } catch {
        // The next pointer, focus or fallback tick looks again.
      } finally {
        checking.delete(orderId);
      }
    }

    function checkTrip() {
      const trip = useActiveTrip.getState().order;
      if (trip && (callWindow(trip, "client").open || callWindow(trip, "shop").open)) void check(trip.id);
    }

    const unsubscribe = subscribeLive((resource, id) => {
      if (resource === "calls") {
        useCall.getState().refresh(id);
        if (id) void check(id);
        else checkTrip();
        return;
      }
      if (resource === "*" || resource === "notifications" || resource === "orders") {
        useCall.getState().refresh();
        checkTrip();
      }
    });
    return () => {
      stopped = true;
      unsubscribe();
    };
  }, [userId, canWork, router]);
}
