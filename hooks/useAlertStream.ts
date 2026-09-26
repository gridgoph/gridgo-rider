import { useEffect } from "react";
import { AppState } from "react-native";
import { accountHold } from "@/lib/accountHold";
import { openAlertStream, type AlertStreamHandle } from "@/lib/alertStream";
import { invalidate, liveGeneration, subscribeLive } from "@/lib/live";
import { useSession } from "@/store/session";
import { useNotifications } from "@/store/notifications";
import { useActiveTrip } from "@/store/activeTrip";

/**
 * Root-owned foreground reconciliation: stream hints, startup/resume, and a
 * 30-second interval refresh identity, trip, and inbox even on a healthy stream.
 * Replay never replaces reconciliation: a consumed event may have failed to
 * refresh its resource. Backgrounding closes the stream; resuming reloads data.
 */
export function useAlertStream(enabled = true): void {
  const userId = useSession((s) => s.user?.id ?? null);
  const verification = useSession((s) => s.user?.verificationStatus);
  const held = useSession((s) => accountHold(s.user) != null);
  useEffect(() => {
    if (!enabled || !userId || held) return;
    const generation = liveGeneration();
    let stopped = false;
    let foreground = AppState.currentState !== "background" && AppState.currentState !== "inactive";
    let handle: AlertStreamHandle | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let refreshing = false;
    const pending = new Set<string>();
    const current = () => !stopped && generation === liveGeneration();
    async function flush() {
      timer = null;
      if (!current() || !foreground || refreshing) return;
      refreshing = true;
      const resources = new Set(pending); pending.clear();
      try {
        if (resources.has("*") || resources.has("identity") || resources.has("approvals")) {
          await useSession.getState().refreshUser();
        }
        if (!current()) return;
        if (resources.has("*") || resources.has("orders") || resources.has("dispatch") || resources.has("identity") || resources.has("escalations")) {
          await useActiveTrip.getState().refresh(userId, "refresh");
        }
        if (resources.has("*") || resources.has("notifications")) {
          try { await useNotifications.getState().refreshUnread(); } catch { /* Next live event/resume or fallback catches up. */ }
        }
      } finally {
        refreshing = false;
        if (pending.size && current() && foreground) timer = setTimeout(() => void flush(), 80);
      }
    }
    const unsubscribe = subscribeLive((resource) => {
      pending.add(resource);
      if (!timer && !refreshing) timer = setTimeout(() => void flush(), 80);
    });
    function start() {
      if (!current()) return;
      handle?.close();
      // Even offline startup must load data and retry; no inbox preflight can block the transport.
      invalidate("*");
      handle = openAlertStream({
        onStatus: (connected) => {
          if (!current()) return;
          if (connected) invalidate("*");
        },
        onResumeUnavailable: () => { if (current()) invalidate("*"); },
        onInvalidate: (event) => { if (current()) invalidate(event.resource); },
        onNotification: (notification) => {
          if (!current() || (notification.userId && notification.userId !== userId)) return;
          invalidate("*");

        },
      });
    }
    if (foreground) start();
    const appState = AppState.addEventListener("change", (next) => {
      foreground = next === "active";
      if (!foreground) { handle?.close(); handle = null; }
      else start();
    });
    // Resilience for unsupported streams, network errors and unavailable native push.
    const fallback = setInterval(() => { if (foreground && current()) invalidate("*"); }, 30_000);
    return () => {
      stopped = true; handle?.close(); appState.remove(); unsubscribe(); clearInterval(fallback);
      if (timer) clearTimeout(timer);
    };
  }, [enabled, userId, verification, held]);
}
