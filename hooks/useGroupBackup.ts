import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import * as api from "@/lib/api";
import { backupApplies, type GroupBackup } from "@/lib/groupOrder";

export type GroupBackupLoad =
  | { status: "off" }
  | { status: "loading" }
  | { status: "ready"; backup: GroupBackup }
  | { status: "error"; message: string };

/** How often a locked backup is asked about again while it is on screen. A refresh cadence, not an unlock rule. */
export const GROUP_BACKUP_REFRESH_MS = 15_000;

/**
 * The group order's backup receiver, as the server says it is right now.
 *
 * Asked only for a group door delivery the rider is carrying (`backupApplies`).
 * While locked it is asked again on a quiet cadence and whenever the app comes
 * back to the foreground — a missed call or the wait at the door is recorded
 * on the server, and only the server's `unlocked: true` opens the row. Once
 * unlocked it stops asking. An error after a good answer keeps the answer.
 */
export function useGroupBackup(
  order: { id: string; state: string; groupOrder?: unknown; fulfillmentMode?: string | null } | null,
): { load: GroupBackupLoad; refresh: () => Promise<void> } {
  const applies = backupApplies(order);
  const orderId = applies && order ? order.id : null;
  const [load, setLoad] = useState<GroupBackupLoad>({ status: "off" });
  const current = useRef<string | null>(null);
  current.current = orderId;

  const refresh = useCallback(async () => {
    const id = current.current;
    if (!id) return;
    try {
      const backup = await api.getGroupBackup(id);
      if (current.current === id) setLoad({ status: "ready", backup });
    } catch (e) {
      if (current.current !== id) return;
      setLoad((prev) =>
        prev.status === "ready"
          ? prev
          : { status: "error", message: api.apiErrorMessage(e, "Could not check the backup receiver.") },
      );
    }
  }, []);

  useEffect(() => {
    if (!orderId) {
      setLoad({ status: "off" });
      return;
    }
    setLoad({ status: "loading" });
    void refresh();
  }, [orderId, refresh]);

  const unlocked = load.status === "ready" && load.backup.unlocked;
  useEffect(() => {
    if (!orderId || unlocked) return;
    const timer = setInterval(() => void refresh(), GROUP_BACKUP_REFRESH_MS);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [orderId, unlocked, refresh]);

  return { load, refresh };
}
