import { router } from "expo-router";
import { useEffect } from "react";
import { AppState } from "react-native";

import { accountHold } from "@/lib/accountHold";
import { approvalPresentation } from "@/lib/riderApproval";
import { setBackgroundFixListener } from "@/lib/tripLocationTask";
import {
  backgroundRefreshDue,
  BUBBLE_NOTICE,
  BUBBLE_ROUTE,
  bubbleLabel,
  bubbleOrderId,
  bubbleUnread,
} from "@/lib/tripBubble";
import { TripBubbleModule } from "@/modules/trip-bubble";
import { useActiveTrip } from "@/store/activeTrip";
import { useBubblePermission } from "@/store/bubblePermission";
import { useNotifications } from "@/store/notifications";
import { useSession } from "@/store/session";

/**
 * Root-owned: shows the delivery bubble for exactly as long as the rider has a
 * job in hand and has allowed it, and keeps its count current.
 *
 * It follows the stores through `subscribe` rather than render, because the
 * moments that matter happen with GRIDGO off screen: an inbox read on a
 * background location fix has to reach the bubble without waiting for React.
 * Whether the bubble is drawn at a given moment is the native side's call —
 * never while a GRIDGO screen is visible.
 */
export function useTripBubble(): void {
  useEffect(() => {
    const native = TripBubbleModule;
    if (!native) return;
    let shown: string | null = null;
    let lastRefreshMs: number | null = null;

    function current() {
      const user = useSession.getState().user;
      const orderId = bubbleOrderId({
        permission: useBubblePermission.getState().permission,
        userId: user?.id ?? null,
        canWork: Boolean(user && !accountHold(user) && approvalPresentation(user).canWork),
        order: useActiveTrip.getState().order,
      });
      return { orderId, userId: user?.id ?? null };
    }

    function sync() {
      const { orderId } = current();
      if (!orderId) {
        if (shown !== null) native?.hide();
        shown = null;
        return;
      }
      const { items, readIds } = useNotifications.getState();
      const count = bubbleUnread(items, readIds, orderId);
      const key = `${orderId}:${count}`;
      if (key === shown) return;
      try {
        // False while Android will not start it (GRIDGO in the background);
        // the next return to the front tries again.
        shown = native?.show(count, bubbleLabel(count), BUBBLE_NOTICE.title, BUBBLE_NOTICE.body, BUBBLE_NOTICE.channel)
          ? key
          : null;
      } catch {
        shown = null;
      }
    }

    const stores = [
      useSession.subscribe(sync),
      useActiveTrip.subscribe(sync),
      useNotifications.subscribe(sync),
      useBubblePermission.subscribe(sync),
    ];

    const appState = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      useBubblePermission.getState().refresh();
      sync();
    });

    const open = native.addListener("onOpen", () => {
      try {
        router.navigate(BUBBLE_ROUTE);
      } catch {
        // No navigator yet: GRIDGO opens on Active anyway.
      }
    });

    setBackgroundFixListener((nowMs) => {
      const { orderId, userId } = current();
      if (!orderId || !backgroundRefreshDue(lastRefreshMs, nowMs)) return;
      lastRefreshMs = nowMs;
      void useNotifications.getState().refreshUnread();
      // The same read tells the bubble the job has ended, so it can go.
      void useActiveTrip.getState().refresh(userId, "refresh");
    });

    sync();
    return () => {
      stores.forEach((unsubscribe) => unsubscribe());
      appState.remove();
      open.remove();
      setBackgroundFixListener(null);
      if (shown !== null) native.hide();
    };
  }, []);
}
