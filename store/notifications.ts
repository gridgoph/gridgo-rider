import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import * as api from "@/lib/api";
import { invalidate } from "@/lib/live";

const STORAGE_KEY = "gridgo.alertsRead.v1";

type NotificationsState = {
  ownerId: string | null;
  bindOwner: (id: string | null) => void;
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
  markRead: (id: string) => Promise<void>;
  markAllRead: (items: api.Notification[]) => Promise<void>;
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
 * Read marks update optimistically and persist only after the owner API accepts
 * the displayed snapshot. Failed writes roll back and refetch the badge.
 *
 * Clearing the inbox is different. `DELETE /notifications/:id` is a durable
 * soft delete — those rows never come back on the next list — so Clear must
 * wait for GRIDGO, not just hide the cards locally.
 */
export const useNotifications = create<NotificationsState>((set, get) => {
  let writeQueue: Promise<void> = Promise.resolve();

  function persist(readIds: string[]) {
    const key = `${STORAGE_KEY}.${get().ownerId ?? "signed-out"}`;
    writeQueue = writeQueue.then(() =>
      AsyncStorage.setItem(key, JSON.stringify(readIds)).catch(() => {
        // The mark still applies for this launch if the write fails.
      }),
    );
  }

  function countUnread(items: api.Notification[], readIds: string[]): number {
    const marked = new Set(readIds);
    return items.reduce((n, item) => n + (item.read || marked.has(item.id) ? 0 : 1), 0);
  }

  return {
    ownerId: null,
    bindOwner: (ownerId) => { if (get().ownerId !== ownerId) set({ownerId, unread:0, readIds:[], hydrated:false}); },
    unread: 0,
    readIds: [],
    hydrated: false,

    hydrate: async () => {
      if (get().hydrated) return;
      const owner = get().ownerId;
      try {
        const raw = await AsyncStorage.getItem(`${STORAGE_KEY}.${owner ?? "signed-out"}`);
        if (owner !== get().ownerId) return;
        const parsed = raw ? (JSON.parse(raw) as unknown) : null;
        if (Array.isArray(parsed)) {
          set({ readIds: parsed.filter((id): id is string => typeof id === "string") });
        }
      } catch {
        // Corrupt or absent — start with nothing marked rather than crash.
      } finally {
        if (owner === get().ownerId) set({ hydrated: true });
      }
    },

    isRead: (item) => item.read || get().readIds.includes(item.id),

    adopt: (items) => set({ unread: countUnread(items, get().readIds) }),

    markRead: async (id) => { await get().markAllRead([{ id } as api.Notification]); },

    markAllRead: async (items) => {
      const owner = get().ownerId;
      const previous = get().readIds;
      const ids = [...new Set(items.map((item) => item.id))];
      const added = ids.filter((id) => !previous.includes(id));
      if (!added.length) return;
      set({ readIds: [...previous, ...added], unread: Math.max(0, get().unread - added.length) });
      try {
        await api.markNotificationsRead(ids);
        if (owner !== get().ownerId) return;
        persist(get().readIds);
        invalidate("notifications");
      } catch {
        if (owner !== get().ownerId) return;
        const drop = new Set(added);
        set({ readIds: get().readIds.filter((id) => !drop.has(id)) });
        await get().refreshUnread();
        invalidate("notifications");
      }
    },

    clear: async (items) => {
      if (!items.length) return { cleared: [], failed: false };
      const owner = get().ownerId;
      const results = await Promise.allSettled(
        items.map((item) => api.deleteNotification(item.id)),
      );
      const cleared: string[] = [];
      let failed = false;
      items.forEach((item, index) => {
        if (results[index]?.status === "fulfilled") cleared.push(item.id);
        else failed = true;
      });
      if (owner !== get().ownerId) return { cleared: [], failed: true };
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
        const owner = get().ownerId;
        const items = await api.listNotifications();
        if (owner === get().ownerId) get().adopt(items);
      } catch {
        // Leave the last known count; the Alerts screen surfaces the error.
      }
    },
  };
});
