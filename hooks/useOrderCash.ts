import { useCallback, useEffect, useState } from "react";

import { useReadVersion } from "@/hooks/useReadVersion";
import * as api from "@/lib/api";
import { isCashOrder } from "@/lib/cash";
import { isActiveTripState } from "@/lib/riderOrder";

/**
 * The cash record of the job in hand (`GET /orders/:id/cash`).
 *
 * The ordinary order read says a job is cash, and its cash `version`, but not
 * whether the shop has been paid or the client's cash collected — so this is
 * read whenever that version, or the job's state, moves. Nothing here is
 * persisted: it is the server's record of money and goes stale with the job.
 */
export function useOrderCash(order: api.Order | null) {
  const nextRead = useReadVersion();
  const cash = order && isCashOrder(order) && isActiveTripState(order.state) ? order : null;
  const key = cash ? `${cash.id}|${cash.cash?.version ?? 0}|${cash.state}` : null;
  const [held, setHeld] = useState<{ key: string; detail: api.OrderCashDetail } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);

  const reload = useCallback(async () => {
    const current = nextRead();
    if (!key || !cash) return;
    try {
      const detail = await api.getOrderCash(cash.id);
      if (!current()) return;
      setHeld({ key, detail });
      setError(null);
    } catch (e) {
      if (!current()) return;
      setError({ key, message: api.apiErrorMessage(e, "This job's cash record did not load. Check the connection and try again.") });
    }
    // `cash` is read through `key`, which names everything it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nextRead]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // A record from an earlier version is still the best guess while the new one loads.
  const detail = held && cash && held.key.startsWith(`${cash.id}|`) ? held.detail : null;
  return {
    detail,
    fresh: Boolean(held && held.key === key),
    error: error && error.key === key ? error.message : null,
    reload,
  };
}
