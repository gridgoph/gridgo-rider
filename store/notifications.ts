import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import * as api from "@/lib/api";

const STORAGE_KEY = "gridgo.alertsRead.v1";

type NotificationsState = {
  unread: number;
  /** Ids the rider has marked read on this phone. */
  readIds: string[];
  hydrated: boolean;
  /** Read the local read marks back at launch. Safe to call more than once. */
  hydrate: () => Promise<void>;
  /** Refresh unread count from the API. Safe to call from any tab. */
  refreshUnread: () => Promise<void>;
  /** Adopt a freshly fetched list: recomputes unread against local marks. */
  adopt: (items: api.Notification[]) => void;
  markRead: (id: string) => void;
  markAllRead: (items: api.Notification[]) => void;
  /**
   * Soft-delete these rows on GRIDGO, then drop their local read marks.
   * Succeeded ids leave the inbox; failed ones stay so the screen can retry.
   */
  clear: (items: api.Notification[]) => Promise<{ cleared: string[]; failed: boolean }>;
  isRead: (item: api.Notification) => boolean;
};

/**
 * The Alerts badge, and which alerts the rider has already dealt with.
 *
 * Marking one read still happens on this phone: `GET /notifications` returns
 * `read`, but this app has not yet wired `PATCH /notifications/:id`. A mark is
 * only ever added, never removed, so the server's own `read` still wins.
 *
 * Clearing the inbox is different. `DELETE /notifications/:id` is a durable
 * soft delete — those rows never come back on the next list — so Clear must
 * wait for GRIDGO, not just hide the cards locally.
 */
export const useNotifications = create<NotificationsState>((set, get) => {
  let writeQueue: Promise<void> = Promise.resolve();

  function persist(readIds: string[]) {
    writeQueue = writeQueue.then(() =>
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(readIds)).catch(() => {
        // The mark still applies for this launch if the write fails.
      }),
    );
  }

  function countUnread(items: api.Notification[], readIds: string[]): number {
    const marked = new Set(readIds);
    return items.reduce((n, item) => n + (item.read || marked.has(item.id) ? 0 : 1), 0);
  }

  return {
    unread: 0,
    readIds: [],
    hydrated: false,

    hydrate: async () => {
      if (get().hydrated) return;
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as unknown) : null;
        if (Array.isArray(parsed)) {
          set({ readIds: parsed.filter((id): id is string => typeof id === "string") });
        }
      } catch {
        // Corrupt or absent — start with nothing marked rather than crash.
      } finally {
        set({ hydrated: true });
      }
    },

    isRead: (item) => item.read || get().readIds.includes(item.id),

    adopt: (items) => set({ unread: countUnread(items, get().readIds) }),

    markRead: (id) => {
      const { readIds } = get();
      if (readIds.includes(id)) return;
      const next = [...readIds, id];
      set({ readIds: next, unread: Math.max(0, get().unread - 1) });
      persist(next);
    },

    markAllRead: (items) => {
      const next = [...new Set([...get().readIds, ...items.map((item) => item.id)])];
      set({ readIds: next, unread: 0 });
      persist(next);
    },

    clear: async (items) => {
      if (!items.length) return { cleared: [], failed: false };
      const results = await Promise.allSettled(
        items.map((item) => api.deleteNotification(item.id)),
      );
      const cleared: string[] = [];
      let failed = false;
      items.forEach((item, index) => {
        if (results[index]?.status === "fulfilled") cleared.push(item.id);
        else failed = true;
      });
      if (cleared.length) {
        const drop = new Set(cleared);
        const next = get().readIds.filter((id) => !drop.has(id));
        set({ readIds: next });
        persist(next);
      }
      return { cleared, failed };
    },

    refreshUnread: async () => {
      try {
        get().adopt(await api.listNotifications());
      } catch {
        // Leave the last known count; the Alerts screen surfaces the error.
      }
    },
  };
});
