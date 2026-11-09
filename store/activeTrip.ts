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
let acceptanceVersion = 0;

export const useActiveTrip = create<ActiveTripState>((set, get) => ({
  order: null,
  loaded: false,
  loading: false,
  error: null,
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
    const version = ++acceptanceVersion;
    ++requestVersion;
    set((s) => ({
      acceptingOffer: true,
      reconciliationGeneration: s.reconciliationGeneration + 1,
      reconciledGeneration: null,
      reconciling: false,
      loading: false,
    }));
    return () => {
      if (version !== acceptanceVersion) return;
      ++acceptanceVersion;
      ++requestVersion;
      // Even a failed response may have accepted the job on the server.
      // Reads begun before it settled cannot authorize a restart.
      set((s) => ({
        acceptingOffer: false,
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
    set({ order, loaded: true, loading: false, reconciling: false, error: null, reconciledGeneration: null });
  },
  clear: () => {
    ++requestVersion;
    ++acceptanceVersion;
    set((s) => ({
      order: null, loaded: false, loading: false, error: null,
      reconciling: false, acceptingOffer: false,
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
      set({ order: null, loaded: true, loading: false, error: null, reconciling: false, reconciledGeneration: null });
      return;
    }
    set({ reconciling: true, ...(mode === "load" ? { loading: true } : {}) });
    try {
      const orders = await api.listOrders();
      if (version !== requestVersion || generation !== liveGeneration()) return;
      set({
        order: selectActiveTrip(orders, riderId),
        error: null,
        loaded: true,
        loading: false,
        reconciling: false,
        reconciledGeneration: reconciliationGeneration,
        reconciledRiderId: riderId,
      });
    } catch (e) {
      if (version !== requestVersion || generation !== liveGeneration()) return;
      if (e instanceof api.ApiError && (e.status === 403 || e.status === 404)) set({order:null});
      set({
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

/** A current successful read, not the screen's cached `loaded` flag, proves idle. */
export function canInterruptTrip(riderId: string | null): boolean {
  const s = useActiveTrip.getState();
  if (s.appState !== "active" || s.acceptingOffer || s.reconciling || s.loading || s.error) return false;
  if (s.order && isActiveTripState(s.order.state)) return false;
  return !riderId || (
    s.loaded && s.reconciledRiderId === riderId &&
    s.reconciledGeneration === s.reconciliationGeneration
  );
}
