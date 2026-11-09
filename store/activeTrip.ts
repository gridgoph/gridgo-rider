import { invalidate, liveGeneration } from "@/lib/live";
import { create } from "zustand";
import { AppState, type AppStateStatus } from "react-native";

import * as api from "@/lib/api";
import { isActiveTripState, selectActiveTrip } from "@/lib/riderOrder";

type ActiveTripState = {
  order: api.Order | null;
  /** True once a load has completed at least once this launch. */
  loaded: boolean;
  loading: boolean;
  error: string | null;
  /**
   * The last read failed without an answer about the trip (a 5xx, a lost
   * connection). That is uncertainty, not "no job": the update block treats
   * the rider as possibly carrying one (`hooks/useUpdateRequired.ts`).
   */
  readFailed: boolean;
  appState: AppStateStatus;
  /** Changes whenever a cached idle answer can no longer authorize interruption. */
  reconciliationGeneration: number;
  reconciledGeneration: number | null;
  reconciledRiderId: string | null;
  /** Every trip HTTP read, including the quiet refresh mode. */
  reconciling: boolean;
  acceptingOffer: boolean;
  syncAppState: (state: AppStateStatus) => void;
  invalidateReconciliation: () => void;
  /** Holds restart permission until acceptance settles and a new read finishes. */
  beginOfferAcceptance: () => () => void;
  /** Pull the rider's one live job. Only `load` shows the screen's loading flag. */
  refresh: (riderId: string | null, mode?: "load" | "refresh") => Promise<void>;
  /** Adopt an order returned by a mutation, without a round trip. */
  setOrder: (order: api.Order | null) => void;
  clear: () => void;
};

/**
 * The one job in hand, shared by the whole shell.
 *
 * The Active screen is no longer the only thing that needs it: the raised
 * centre disc has to know what the next step is from any tab, which means the
 * trip cannot live in one screen's `useState`. Nothing here is persisted — a
 * job's state belongs to the server, and a stale one shown at launch would be
 * a lie about where the package is.
 */
let requestVersion = 0;
// Session/cache clearing cannot cancel an HTTP mutation. Each operation owns
// its lock until its own finalizer runs, including across rider changes.
const pendingAcceptances = new Set<symbol>();

export const useActiveTrip = create<ActiveTripState>((set, get) => ({
  order: null,
  loaded: false,
  loading: false,
  error: null,
  readFailed: false,
  appState: AppState.currentState,
  reconciliationGeneration: 0,
  reconciledGeneration: null,
  reconciledRiderId: null,
  reconciling: false,
  acceptingOffer: false,
  invalidateReconciliation: () => set((s) => ({
    reconciliationGeneration: s.reconciliationGeneration + 1,
    reconciledGeneration: null,
  })),
  syncAppState: (state) => {
    if (get().appState === state) return;
    // Called synchronously by the root and update listeners, before either
    // can act on an old idle result. Duplicate lifecycle callbacks are safe.
    set((s) => ({
      appState: state,
      reconciliationGeneration: s.reconciliationGeneration + 1,
      reconciledGeneration: null,
    }));
  },
  beginOfferAcceptance: () => {
    const operation = Symbol();
    pendingAcceptances.add(operation);
    ++requestVersion;
    set((s) => ({
      acceptingOffer: true,
      reconciliationGeneration: s.reconciliationGeneration + 1,
      reconciledGeneration: null,
      reconciling: false,
      loading: false,
    }));
    return () => {
      if (!pendingAcceptances.delete(operation)) return;
      ++requestVersion;
      // Even a failed response may have accepted the job on the server.
      // Reads begun before it settled cannot authorize a restart.
      set((s) => ({
        acceptingOffer: pendingAcceptances.size > 0,
        reconciliationGeneration: s.reconciliationGeneration + 1,
        reconciledGeneration: null,
        reconciling: false,
        loading: false,
      }));
      invalidate("orders");
    };
  },
  setOrder: (order) => {
    ++requestVersion;
    set({ order, loaded: true, loading: false, reconciling: false, error: null, readFailed: false, reconciledGeneration: null });
  },
  clear: () => {
    ++requestVersion;
    set((s) => ({
      order: null, loaded: false, loading: false, error: null, readFailed: false,
      reconciling: false, acceptingOffer: pendingAcceptances.size > 0,
      reconciliationGeneration: s.reconciliationGeneration + 1,
      reconciledGeneration: null, reconciledRiderId: null,
    }));
  },
  refresh: async (riderId, mode = "load") => {
    get().syncAppState(AppState.currentState);
    const version = ++requestVersion;
    const generation = liveGeneration();
    const reconciliationGeneration = get().reconciliationGeneration;
    if (!riderId) {
      set({ order: null, loaded: true, loading: false, error: null, readFailed: false, reconciling: false, reconciledGeneration: null });
      return;
    }
    set({ reconciling: true, ...(mode === "load" ? { loading: true } : {}) });
    try {
      const orders = await api.listOrders();
      if (version !== requestVersion || generation !== liveGeneration()) return;
      set({
        order: selectActiveTrip(orders, riderId),
        error: null,
        readFailed: false,
        loaded: true,
        loading: false,
        reconciling: false,
        reconciledGeneration: reconciliationGeneration,
        reconciledRiderId: riderId,
      });
    } catch (e) {
      if (version !== requestVersion || generation !== liveGeneration()) return;
      // 403/404 answer the question (no job this rider can hold); anything else does not.
      const answered = e instanceof api.ApiError && (e.status === 403 || e.status === 404);
      if (answered) set({order:null});
      set({
        readFailed: !answered,
        error: api.apiErrorMessage(
          e,
          "Your trip did not load. Check the phone's connection and pull down to try again.",
        ),
        loaded: true,
        loading: false,
        reconciling: false,
        reconciledGeneration: null,
      });
    }
  },
}));

/** Signed-out installs defer updates until sign-in and fresh trip reconciliation. */
export function canInterruptTrip(riderId: string | null): boolean {
  const s = useActiveTrip.getState();
  if (!riderId) return false;
  if (s.appState !== "active" || s.acceptingOffer || s.reconciling || s.loading || s.error) return false;
  if (s.order && isActiveTripState(s.order.state)) return false;
  return s.loaded && s.reconciledRiderId === riderId &&
    s.reconciledGeneration === s.reconciliationGeneration;
}
