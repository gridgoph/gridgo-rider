import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

/**
 * A cash no-show at the door, as this phone saw it.
 *
 * The server measures the wait (`noShowWaitSeconds`) and refuses an early
 * report, but it does not tell the rider when their wait began or that their
 * report went in. So this keeps exactly those two facts per job — when the
 * server accepted the start, and when it accepted the report — so a relaunch
 * at the door shows the same timer and does not ask for a second report.
 * Times, a contact method and nothing else: no photo, no reason, no money.
 */
export type CashNoShowRecord = {
  startedAtMs: number;
  contactMethod: "call" | "message";
  reportedAtMs: number | null;
};

const KEY = "gridgo.cashNoShow.v1";
/** A record outlives no job by much; drop anything older than two days on load. */
const KEEP_MS = 2 * 24 * 3600 * 1000;

type State = {
  byOrder: Record<string, CashNoShowRecord>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  started: (orderId: string, contactMethod: "call" | "message", atMs: number) => void;
  reported: (orderId: string, atMs: number) => void;
};

function save(byOrder: Record<string, CashNoShowRecord>) {
  void AsyncStorage.setItem(KEY, JSON.stringify(byOrder)).catch(() => undefined);
}

function valid(value: unknown): value is CashNoShowRecord {
  const record = value as CashNoShowRecord;
  return (
    typeof record === "object" && record !== null &&
    Number.isFinite(record.startedAtMs) &&
    (record.contactMethod === "call" || record.contactMethod === "message") &&
    (record.reportedAtMs === null || Number.isFinite(record.reportedAtMs))
  );
}

export const useCashNoShow = create<State>((set, get) => ({
  byOrder: {},
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const now = Date.now();
      const kept: Record<string, CashNoShowRecord> = {};
      for (const [orderId, record] of Object.entries(parsed)) {
        if (valid(record) && now - record.startedAtMs < KEEP_MS) kept[orderId] = record;
      }
      // Anything recorded while the read was in flight wins.
      set((s) => ({ byOrder: { ...kept, ...s.byOrder }, hydrated: true }));
    } catch {
      set({ hydrated: true });
    }
  },
  started: (orderId, contactMethod, atMs) => {
    const byOrder = { ...get().byOrder, [orderId]: { startedAtMs: atMs, contactMethod, reportedAtMs: null } };
    set({ byOrder });
    save(byOrder);
  },
  reported: (orderId, atMs) => {
    const current = get().byOrder[orderId];
    if (!current) return;
    const byOrder = { ...get().byOrder, [orderId]: { ...current, reportedAtMs: atMs } };
    set({ byOrder });
    save(byOrder);
  },
}));
