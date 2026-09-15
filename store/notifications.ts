import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import * as api from "@/lib/api";
import { invalidate } from "@/lib/live";

const STORAGE_KEY = "gridgo.alertsRead.v1";

type NotificationsState = {
  ownerId: string | null;
  bindOwner: (id: string | null) => void;
  unread: number;
  items: api.Notification[] | null;
  loadError: string | null;
  load: () => Promise<void>;
  /** Optimistic and confirmed read IDs for the currently bound rider. */
  readIds: string[];
  confirmedReadIds: string[];
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
 * Read marks update optimistically through PATCH /notifications/:id. Only
 * confirmed acknowledgements persist, under an account-specific storage key.
 * Failed writes roll back both the marks and badge before reconciliation.
 * Inbox reads adopt only their newest result, including its error; owner changes
 * and successful deletions invalidate older reads. Server read flags still win.
 *
 * Clearing the inbox is different. `DELETE /notifications/:id` is a durable
 * soft delete — those rows never come back on the next list — so Clear must
 * wait for GRIDGO, not just hide the cards locally.
 */
export const useNotifications = create<NotificationsState>((set, get) => {
  let writeQueue: Promise<void> = Promise.resolve();
  let readVersion = 0;

  function persist() {
    const readIds = get().confirmedReadIds;
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
    bindOwner: (ownerId) => {
      if (get().ownerId === ownerId) return;
      readVersion += 1;
      set({ ownerId, items: null, loadError: null, unread: 0, readIds: [], confirmedReadIds: [], hydrated: false });
    },
    unread: 0,
    items: null,
    loadError: null,
    readIds: [],
    confirmedReadIds: [],
    hydrated: false,

    hydrate: async () => {
      if (get().hydrated) return;
      const owner = get().ownerId;
      try {
        const raw = await AsyncStorage.getItem(`${STORAGE_KEY}.${owner ?? "signed-out"}`);
        if (owner !== get().ownerId) return;
        const parsed = raw ? (JSON.parse(raw) as unknown) : null;
        if (Array.isArray(parsed)) {
          const confirmedReadIds = [...new Set([
            ...parsed.filter((id): id is string => typeof id === "string"),
            ...get().confirmedReadIds,
          ])];
          set({ confirmedReadIds, readIds: [...new Set([...confirmedReadIds, ...get().readIds])] });
        }
      } catch {
        // Corrupt or absent — start with nothing marked rather than crash.
      } finally {
        if (owner === get().ownerId) set({ hydrated: true });
      }
    },

    isRead: (item) => item.read || get().readIds.includes(item.id),

    adopt: (items) => {
      readVersion += 1;
      set({ items, loadError: null, unread: countUnread(items, get().readIds) });
    },

    load: async () => {
      const version = ++readVersion;
      try {
        const items = await api.listNotifications();
        if (version === readVersion) get().adopt(items);
      } catch (error) {
        if (version === readVersion) {
          set({
            loadError: api.apiErrorMessage(
              error,
              "Alerts did not load. Check the phone's connection and pull down to try again.",
            ),
          });
          throw error;
        }
      }
    },

    markRead: async (id) => { await get().markAllRead([{ id } as api.Notification]); },

    markAllRead: async (items) => {
      const owner = get().ownerId;
      const previous = get().readIds;
      const ids = [...new Set(items.map((item) => item.id))];
      const added = ids.filter((id) => !previous.includes(id));
      if (!added.length) return;
      set({ readIds: [...previous, ...added], unread: Math.max(0, get().unread - added.length) });
      try {
        await api.markNotificationsRead(added);
        if (owner !== get().ownerId) return;
        const accepted = added.filter((id) => get().readIds.includes(id));
        set({ confirmedReadIds: [...new Set([...get().confirmedReadIds, ...accepted])] });
        persist();
        invalidate("notifications");
      } catch {
        if (owner !== get().ownerId) return;
        const drop = new Set(added);
        const readIds = get().readIds.filter((id) => !drop.has(id));
        set({ readIds, unread: countUnread(get().items ?? [], readIds) });
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
        set({ readIds: next, confirmedReadIds: get().confirmedReadIds.filter((id) => !drop.has(id)) });
        get().adopt((get().items ?? []).filter((item) => !drop.has(item.id)));
        persist();
      }
      return { cleared, failed };
    },

    refreshUnread: async () => {
      try {
        await get().load();
      } catch {
        // Leave the last known count; the Alerts screen surfaces the error.
      }
    },
  };
});
