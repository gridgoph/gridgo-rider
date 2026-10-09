import { useEffect, useState } from "react";

import * as api from "@/lib/api";
import { subscribeLive } from "@/lib/live";
import type { OrderCall } from "@/lib/orderCalls";

/**
 * This rider's calls on one job, kept current by the stream's `calls` pointer
 * and every broader refresh. Read only while `enabled` — a job with no call
 * window has nothing to read, and the API would refuse it.
 */
export function useOrderCalls(orderId: string | null, enabled: boolean): OrderCall[] {
  // Keyed by order, so a different job never shows the last one's calls.
  const [read, setRead] = useState<{ orderId: string; calls: OrderCall[] } | null>(null);

  useEffect(() => {
    if (!orderId || !enabled) return;
    let stopped = false;
    let version = 0;
    const load = () => {
      const mine = ++version;
      void api.listOrderCalls(orderId).then(
        (next) => {
          if (!stopped && mine === version) setRead({ orderId, calls: next });
        },
        () => undefined,
      );
    };
    load();
    const unsubscribe = subscribeLive((resource, id) => {
      if ((resource === "calls" && (!id || id === orderId)) || resource === "*" || resource === "orders") load();
    });
    return () => {
      stopped = true;
      unsubscribe();
    };
  }, [orderId, enabled]);

  return enabled && read && read.orderId === orderId ? read.calls : [];
}
