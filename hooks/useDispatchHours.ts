import { useCallback, useState } from "react";

import * as api from "@/lib/api";
import { dispatchOpensLine } from "@/lib/dispatchHours";

/**
 * Whether dispatch is open, read beside the Offers list so the two land together.
 *
 * A failed read keeps the last answer: it must never fail the list, and with no
 * answer at all the screen makes no claim about hours.
 */
export function useDispatchHours() {
  const [known, setKnown] = useState<{ status: api.OperatingStatus; atMs: number } | null>(null);

  const adopt = useCallback((status: api.OperatingStatus) => {
    setKnown({ status, atMs: Date.now() });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const status = await api.getOperatingStatus();
      if (status) adopt(status);
    } catch {
      // The list's own read reports a dead connection.
    }
  }, [adopt]);

  const opensLine =
    known && !known.status.isOpenNow
      ? dispatchOpensLine(known.status.scheduledReviewAt, known.atMs)
      : null;

  return { opensLine, refresh, adopt };
}
