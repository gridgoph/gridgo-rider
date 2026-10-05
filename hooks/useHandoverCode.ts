import { useCallback, useEffect, useState } from "react";

import { useReadVersion } from "@/hooks/useReadVersion";
import * as api from "@/lib/api";
import type { HandoverCodeLoad } from "@/lib/handoverCode";

/**
 * Read the handover code for the delivery step.
 *
 * `orderId` is null until the job has loaded, and for a job that ends at
 * GRIDGO Office — the server refuses the rider that read, and there is nobody
 * at the far end to compare with. Either way the answer is "none".
 *
 * The code is minted once and never changes, so it is read once per job; a
 * failed read is retried by the rider, never assumed away — a governed delivery
 * cannot be recorded without it.
 */
export function useHandoverCode(orderId: string | null) {
  const [load, setLoad] = useState<HandoverCodeLoad>(
    orderId ? { status: "loading" } : { status: "none" },
  );
  const [previousOrderId, setPreviousOrderId] = useState(orderId);
  if (previousOrderId !== orderId) {
    setPreviousOrderId(orderId);
    setLoad(orderId ? { status: "loading" } : { status: "none" });
  }

  const nextRead = useReadVersion();
  const read = useCallback(() => {
    const current = nextRead();
    if (!orderId) return Promise.resolve();
    return api
      .getHandover(orderId)
      .then((handover) => {
        if (!current()) return;
        setLoad(handover ? { status: "ready", otp: handover.otp } : { status: "none" });
      })
      .catch((e: unknown) => {
        if (!current()) return;
        setLoad({
          status: "error",
          message: api.apiErrorMessage(
            e,
            "The handover code did not load. Check your connection and try again.",
          ),
        });
      });
  }, [orderId, nextRead]);

  const retry = useCallback(() => {
    setLoad({ status: "loading" });
    return read();
  }, [read]);

  useEffect(() => {
    void read();
  }, [read]);

  return { load, retry };
}
