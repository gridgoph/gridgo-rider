import { create } from "zustand";

import type { LocalArrivals } from "@/lib/tripSteps";

/**
 * Arrivals the rider tapped on the map for a job the server keeps no
 * milestone for (a GRIDGO Office job, or an API that refused the record).
 * They only move the four-step rail on this phone; no gate reads them. In
 * memory only: a relaunch re-reads the job and asks again, which costs one
 * tap and never a wrong step.
 */
type TripArrivalsState = {
  byOrder: Record<string, LocalArrivals>;
  mark: (orderId: string, stop: keyof LocalArrivals) => void;
};

export const useTripArrivals = create<TripArrivalsState>((set) => ({
  byOrder: {},
  mark: (orderId, stop) =>
    set((s) => ({
      byOrder: {
        ...s.byOrder,
        [orderId]: { ...(s.byOrder[orderId] ?? { shop: false, destination: false }), [stop]: true },
      },
    })),
}));
