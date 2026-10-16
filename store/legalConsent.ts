import { create } from "zustand";

import * as api from "@/lib/api";
import type { LegalVersion } from "@/lib/api";
import {
  type LegalGateStatus,
  isLegalUnsupported,
  isLegalVersionChanged,
  LEGAL_VERSION_CHANGED,
} from "@/lib/legal";
import { legalContext } from "@/lib/legalContext";

/**
 * Whether the signed-in rider still has terms to agree to
 * (`GET /me/legal/pending`), read on every sign-in and every return to the app.
 * What each status means is on `LegalGateStatus` in `lib/legal.ts`.
 */
export type { LegalGateStatus };

type LegalConsentState = {
  userId: string | null;
  status: LegalGateStatus;
  pending: LegalVersion[];
  notices: LegalVersion[];
  accepting: boolean;
  error: string | null;
  /** Never throws. */
  load: (userId: string) => Promise<void>;
  /** Agree to every pending version on screen. True when nothing is left. */
  accept: () => Promise<boolean>;
  reset: () => void;
};

const initial = {
  userId: null,
  status: "unknown" as LegalGateStatus,
  pending: [] as LegalVersion[],
  notices: [] as LegalVersion[],
  accepting: false,
  error: null,
};

let inflight: { userId: string; promise: Promise<void> } | null = null;

/**
 * How long a first read may hold the launch. Past it the rider goes in, and a
 * late "blocked" answer still closes the app behind them.
 */
export const LEGAL_FIRST_READ_MS = 5_000;

export const useLegalConsent = create<LegalConsentState>((set, get) => ({
  ...initial,

  load: (userId) => {
    if (inflight?.userId === userId) return inflight.promise;
    // A different account starts from nothing: another rider's answer must
    // never open, or close, this one's app.
    if (get().userId !== userId) set({ ...initial, userId });
    const failOpen = setTimeout(() => {
      if (get().userId === userId && get().status === "unknown") set({ status: "clear" });
    }, LEGAL_FIRST_READ_MS);
    const promise = (async () => {
      try {
        const answer = await api.getLegalPending();
        if (get().userId !== userId) return;
        const pending = answer.pending ?? [];
        set({
          status: answer.blocking && pending.length ? "blocked" : "clear",
          pending,
          notices: answer.notices ?? [],
        });
      } catch (error) {
        if (get().userId !== userId) return;
        if (isLegalUnsupported(error)) {
          set({ status: "clear", pending: [], notices: [] });
          return;
        }
        // Keep a known answer; only an unanswered first read fails open.
        if (get().status === "unknown") set({ status: "clear" });
      } finally {
        clearTimeout(failOpen);
        if (inflight?.userId === userId) inflight = null;
      }
    })();
    inflight = { userId, promise };
    return promise;
  },

  accept: async () => {
    const { pending, accepting, userId } = get();
    if (accepting || !userId || pending.length === 0) return pending.length === 0;
    set({ accepting: true, error: null });
    try {
      const answer = await api.acceptLegalVersions(
        pending.map((doc) => doc.id),
        await legalContext(),
      );
      if (get().userId !== userId) return false;
      const left = answer.pending ?? [];
      set({
        status: answer.blocking && left.length ? "blocked" : "clear",
        pending: left,
        notices: answer.notices ?? [],
      });
      return left.length === 0;
    } catch (error) {
      if (isLegalVersionChanged(error)) {
        // Fetch the new text and ask again; never agree on the rider's behalf.
        set({ error: LEGAL_VERSION_CHANGED });
        await get().load(userId);
        return false;
      }
      set({
        error: "Your agreement did not reach GRIDGO. Check this phone's connection and try again.",
      });
      return false;
    } finally {
      set({ accepting: false });
    }
  },

  reset: () => {
    inflight = null;
    set(initial);
  },
}));

/** The gate as the launch and the auth gate read it: only this account's answer counts. */
export function legalGateFor(
  state: Pick<LegalConsentState, "userId" | "status">,
  userId: string | null | undefined,
): LegalGateStatus {
  if (!userId || state.userId !== userId) return "unknown";
  return state.status;
}
