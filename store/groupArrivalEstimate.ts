import { create } from "zustand";

/**
 * The arrival estimate this rider last shared with a group, per order.
 *
 * In memory only, never persisted: it is a promise about the next few minutes
 * and goes stale the moment the app is put away. The order read does not
 * carry it back, so this is the only place the rider's own last answer lives.
 */
type Shared = { minutes: number; estimatedArrivalAt: string | null };

type GroupArrivalEstimateState = {
  byOrder: Record<string, Shared>;
  record: (orderId: string, shared: Shared) => void;
  clear: () => void;
};

export const useGroupArrivalEstimate = create<GroupArrivalEstimateState>((set) => ({
  byOrder: {},
  record: (orderId, shared) => set((s) => ({ byOrder: { ...s.byOrder, [orderId]: shared } })),
  clear: () => set({ byOrder: {} }),
}));
