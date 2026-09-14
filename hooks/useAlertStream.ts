import { useEffect } from "react";
import { AppState } from "react-native";
import { openAlertStream, type AlertStreamHandle } from "@/lib/alertStream";
import { invalidate, liveGeneration, subscribeLive } from "@/lib/live";
import { useSession } from "@/store/session";
import { useNotifications } from "@/store/notifications";
import { useActiveTrip } from "@/store/activeTrip";

/** One connection per signed-in app. Inbox replay never replaces resource reconciliation. */
export function useAlertStream(enabled = true): void {
  const userId = useSession((s) => s.user?.id ?? null);
  const verification = useSession((s) => s.user?.verificationStatus);
  useEffect(() => {
    if (!enabled || !userId) return;
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
  }, [enabled, userId, verification]);
}
