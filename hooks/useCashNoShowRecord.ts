import { useEffect } from "react";

import type * as api from "@/lib/api";
import { noShowFromServer } from "@/lib/cash";
import { useCashNoShow } from "@/store/cashNoShow";
import { useSession } from "@/store/session";

/**
 * This phone's no-show record for a job, kept in line with the server.
 *
 * The record is only a stand-in for what the server does not project to the
 * rider. Whenever the job or its cash record is read again, `noShowFromServer`
 * decides whether the server has overtaken it — collected, approved, rejected
 * or reassigned — and the stored record is replaced or dropped to match.
 */
export function useCashNoShowRecord(orderId: string | null, order: api.Order | null, detail: api.OrderCashDetail | null) {
  const record = useCashNoShow((s) => (orderId ? s.byOrder[orderId] : undefined));
  const hydrated = useCashNoShow((s) => s.hydrated);
  const hydrate = useCashNoShow((s) => s.hydrate);
  const replace = useCashNoShow((s) => s.replace);
  const riderId = useSession((s) => s.user?.id ?? null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const verdict = hydrated && orderId && order?.id === orderId ? noShowFromServer(record, order, detail, riderId) : null;
  const change = verdict && verdict.kind !== "keep" ? verdict : null;
  useEffect(() => {
    if (!orderId || !change) return;
    replace(orderId, change.kind === "adopt" ? change.record : null);
  }, [orderId, change?.kind, change?.kind === "adopt" ? change.record.startedAtMs : null, change?.kind === "adopt" ? change.record.reportedAtMs : null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Until the replacement lands, show the server's answer rather than the stale record.
  if (change) return change.kind === "adopt" ? change.record : undefined;
  return record;
}
