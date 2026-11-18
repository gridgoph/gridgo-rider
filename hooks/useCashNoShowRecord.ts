import { useEffect } from "react";

import type * as api from "@/lib/api";
import { noShowFromServer } from "@/lib/cash";
import { useCashNoShow } from "@/store/cashNoShow";
import { useSession } from "@/store/session";

/**
 * This phone's no-show record for a job, kept in line with the server.
 *
 * Whenever the job or its cash record is read again, `noShowFromServer` decides
 * whether the server has overtaken the stored record — started, reported,
 * rejected, collected, approved or reassigned — and it is replaced or dropped
 * to match. The delivery and no-show screens can both be mounted with reads of
 * different ages, so a read older than the newest one applied for the job is
 * ignored: otherwise the two would undo each other on every render.
 */
export function useCashNoShowRecord(orderId: string | null, order: api.Order | null, detail: api.OrderCashDetail | null) {
  const record = useCashNoShow((s) => (orderId ? s.byOrder[orderId] : undefined));
  const applied = useCashNoShow((s) => (orderId ? s.serverVersion[orderId] : undefined));
  const hydrated = useCashNoShow((s) => s.hydrated);
  const hydrate = useCashNoShow((s) => s.hydrate);
  const replace = useCashNoShow((s) => s.replace);
  const riderId = useSession((s) => s.user?.id ?? null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const current = Boolean(detail) && (applied == null || (detail?.version ?? -1) >= applied);
  const verdict = hydrated && orderId && order?.id === orderId && current ? noShowFromServer(record, order, detail, riderId) : null;
  const version = detail?.version ?? null;
  const kind = verdict?.kind ?? null;
  const next = verdict?.kind === "adopt" ? verdict.record : null;
  const startedAtMs = next?.startedAtMs ?? null;
  const reportedAtMs = next?.reportedAtMs ?? null;
  useEffect(() => {
    if (!orderId || !kind || version == null) return;
    if (kind === "keep") replace(orderId, undefined, version);
    else if (kind === "clear") replace(orderId, null, version);
    else if (startedAtMs != null) replace(orderId, { startedAtMs, contactMethod: record?.contactMethod ?? null, reportedAtMs }, version);
  }, [orderId, kind, version, startedAtMs, reportedAtMs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Until the replacement lands, show the server's answer rather than the stale record.
  if (verdict?.kind === "clear") return undefined;
  if (verdict?.kind === "adopt") return verdict.record;
  return record;
}
