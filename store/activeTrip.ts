import { create } from "zustand";

import * as api from "@/lib/api";
import { selectActiveTrip } from "@/lib/riderOrder";

type ActiveTripState = {
  order: api.Order | null;
  /** True once a load has completed at least once this launch. */
  loaded: boolean;
  loading: boolean;
  error: string | null;
  /** Pull the rider's one live job. `mode` only changes which flag moves. */
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
export const useActiveTrip = create<ActiveTripState>((set) => ({
  order: null,
  loaded: false,
  loading: false,
  error: null,
  setOrder: (order) => set({ order, loaded: true, error: null }),
  clear: () => set({ order: null, loaded: false, loading: false, error: null }),
  refresh: async (riderId, mode = "load") => {
    if (!riderId) {
      set({ order: null, loaded: true, loading: false });
      return;
    }
    if (mode === "load") set({ loading: true });
    try {
      const orders = await api.listOrders();
      set({
        order: selectActiveTrip(orders, riderId),
        error: null,
        loaded: true,
        loading: false,
      });
    } catch (e) {
      set({
        error: api.apiErrorMessage(
          e,
          "Your trip did not load. Check the phone's connection and pull down to try again.",
        ),
        loaded: true,
        loading: false,
      });
    }
  },
}));
