import { create } from "zustand";

import * as api from "@/lib/api";
import { unreadCount } from "@/lib/riderOrder";

type NotificationsState = {
  unread: number;
  /** Refresh unread count from the API. Safe to call from any tab. */
  refreshUnread: () => Promise<void>;
  setUnread: (n: number) => void;
};

/**
 * Tab-bar badge source for Alerts.
 * Only the count is shared — the list itself stays on the Alerts screen.
 */
export const useNotifications = create<NotificationsState>((set) => ({
  unread: 0,
  setUnread: (n) => set({ unread: n }),
  refreshUnread: async () => {
    try {
      const items = await api.listNotifications();
      set({ unread: unreadCount(items) });
    } catch {
      // Leave the last known count; the Alerts screen surfaces the error.
    }
  },
}));
