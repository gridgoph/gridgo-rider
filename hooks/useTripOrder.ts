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
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId) {
      setOrder(null);
      setLoading(false);
      setError("This job is no longer open. Go back to your trip.");
      return;
    }
    setLoading(true);
    try {
      const next = await api.getOrder(orderId);
      setOrder(next);
      setError(null);
    } catch (e) {
      setError(
        api.apiErrorMessage(e, "Could not load this job. Check your connection and try again."),
      );
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { order, setOrder, loading, error, reload: load };
}
