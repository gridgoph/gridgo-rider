import { create } from "zustand";

import { readBubblePermission, type BubblePermission } from "@/lib/tripBubble";

type BubblePermissionState = {
  permission: BubblePermission;
  /** Re-read the phone's answer, e.g. back from its settings screen. */
  refresh: () => void;
};

/**
 * Whether this phone lets GRIDGO draw the delivery bubble.
 *
 * Read from the phone every time rather than remembered: the rider changes it
 * on Android's own screen, where this app cannot see the answer being given.
 * `hooks/useTripBubble.ts` re-reads it whenever GRIDGO comes back to the front.
 */
export const useBubblePermission = create<BubblePermissionState>((set, get) => ({
  permission: readBubblePermission(),
  refresh: () => {
    const permission = readBubblePermission();
    if (permission !== get().permission) set({ permission });
  },
}));
