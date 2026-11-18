import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

/**
 * A cash no-show at the door, as this phone saw it.
 *
 * The server owns the wait and the report: the rider's cash record carries
 * `noShowStartedAt` and `noShowReportedAt`. This keeps the same two facts per
 * job so the screens have them before that record is read, and across a
 * relaunch while offline. It is only a stand-in for the server:
 * `noShowFromServer` clears or replaces it whenever a server read says otherwise.
 *
 * `serverVersion` is the newest cash version each record has been checked
 * against (memory only). Two screens can hold reads of different ages; an
 * older read never overrides a newer one, or the two would undo each other.
 * Times, a contact method and nothing else: no photo, no reason, no money.
 */
export type CashNoShowRecord = {
  startedAtMs: number;
  /** Null when the record came from the server, which does not say. */
  contactMethod: "call" | "message" | null;
  reportedAtMs: number | null;
};

const KEY = "gridgo.cashNoShow.v1";
/** A record outlives no job by much; drop anything older than two days on load. */
const KEEP_MS = 2 * 24 * 3600 * 1000;

type State = {
  byOrder: Record<string, CashNoShowRecord>;
  hydrated: boolean;
  serverVersion: Record<string, number>;
  hydrate: () => Promise<void>;
  /** `version` is the cash version in the server's reply to the start or report. */
  started: (orderId: string, contactMethod: "call" | "message", atMs: number, version?: number) => void;
  reported: (orderId: string, atMs: number, version?: number) => void;
  /**
   * The server's word at cash `version` replaces this phone's
   * (`noShowFromServer`): adopt a record, forget the job (null), or keep the
   * record and only note the version (undefined). Ignored when older than the
   * version already applied.
   */
  replace: (orderId: string, record: CashNoShowRecord | null | undefined, version: number) => void;
};

function stamp(versions: Record<string, number>, orderId: string, version: number | undefined) {
  if (version == null || (versions[orderId] ?? -1) >= version) return versions;
  return { ...versions, [orderId]: version };
}

function save(byOrder: Record<string, CashNoShowRecord>) {
  void AsyncStorage.setItem(KEY, JSON.stringify(byOrder)).catch(() => undefined);
}

function valid(value: unknown): value is CashNoShowRecord {
  const record = value as CashNoShowRecord;
  return (
    typeof record === "object" && record !== null &&
    Number.isFinite(record.startedAtMs) &&
    (record.contactMethod === "call" || record.contactMethod === "message" || record.contactMethod === null) &&
    (record.reportedAtMs === null || Number.isFinite(record.reportedAtMs))
  );
}

export const useCashNoShow = create<State>((set, get) => ({
  byOrder: {},
  serverVersion: {},
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
  started: (orderId, contactMethod, atMs, version) => {
    const byOrder = { ...get().byOrder, [orderId]: { startedAtMs: atMs, contactMethod, reportedAtMs: null } };
    set({ byOrder, serverVersion: stamp(get().serverVersion, orderId, version) });
    save(byOrder);
  },
  replace: (orderId, record, version) => {
    if ((get().serverVersion[orderId] ?? -1) > version) return;
    const serverVersion = stamp(get().serverVersion, orderId, version);
    if (record === undefined) {
      if (serverVersion !== get().serverVersion) set({ serverVersion });
      return;
    }
    const byOrder = { ...get().byOrder };
    if (record) byOrder[orderId] = record;
    else delete byOrder[orderId];
    set({ byOrder, serverVersion });
    save(byOrder);
  },
  reported: (orderId, atMs, version) => {
    const current = get().byOrder[orderId];
    if (!current) return;
    const byOrder = { ...get().byOrder, [orderId]: { ...current, reportedAtMs: atMs } };
    set({ byOrder, serverVersion: stamp(get().serverVersion, orderId, version) });
    save(byOrder);
  },
}));
