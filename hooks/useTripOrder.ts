import { useReadVersion } from "@/hooks/useReadVersion";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useCallback, useEffect, useState } from "react";

import * as api from "@/lib/api";

/**
 * Load one job for a pushed proof screen.
 *
 * Proof screens are opened with an order id, not with the order itself: a
 * screen that trusted a snapshot passed through navigation could confirm a
 * pickup against a job the server has already moved on.
 */
export function useTripOrder(orderId: string | null) {
  const [order, setOrder] = useState<api.Order | null>(null);
  const [loading, setLoading] = useState(Boolean(orderId));
  const missingOrderMessage = "This job could not be opened. Go back and try again.";
  const [error, setError] = useState<string | null>(orderId ? null : missingOrderMessage);
  const [previousOrderId, setPreviousOrderId] = useState(orderId);
  if (previousOrderId !== orderId) {
    setPreviousOrderId(orderId);
    setOrder(null);
    setLoading(Boolean(orderId));
    setError(orderId ? null : missingOrderMessage);
  }

  const nextRead = useReadVersion();
  /** Resolves true only when this read's copy of the job was adopted. */
  const load = useCallback((): Promise<boolean> => {
    const current = nextRead();
    if (!orderId) return Promise.resolve(false);
    return api.getOrder(orderId).then((next) => {
      if (!current()) return false;
      setOrder(next);
      setError(null);
      return true;
    }).catch((e: unknown) => {
      if (!current()) return false;
      if (e instanceof api.ApiError && (e.status === 403 || e.status === 404)) setOrder(null);
      setError(
        api.apiErrorMessage(e, "Could not load this job. Check your connection and try again."),
      );
      return false;
    }).finally(() => {
      if (current()) setLoading(false);
    });
  }, [orderId, nextRead]);

  const reload = useCallback((mode: "load" | "refresh" = "load") => {
    if (mode === "load" && orderId) setLoading(true);
    return load();
  }, [load, orderId]);

  useLiveRefresh(
    ["orders", "jobs", "dispatch", "escalations", "claims", "payouts"],
    () => reload("refresh"),
  );

  useEffect(() => {
    void load();
  }, [load]);

  return { order, setOrder, loading, error, reload };
}
