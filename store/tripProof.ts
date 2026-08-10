import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import type { FailureOutcome, FailureReasonId, TripExceptionSummary } from "@/lib/riderOrder";

/**
 * Proof work in progress, and what the rider recorded when a delivery failed.
 *
 * Two things live here, both keyed by order:
 *
 * 1. **Drafts.** A half-filled proof survives the app being killed. Riders lose
 *    the app to a phone call, a dead battery, or Android reclaiming memory in a
 *    stairwell, and retyping a code and a reason at the door is not acceptable.
 *    Typed and chosen values only: a captured photo lives in a cache the system
 *    can reclaim, so promising it is still there would be a lie.
 * 2. **Exceptions.** The demo API records a failure proof but exposes no state
 *    for it and no way to read proofs back, so the follow-up the rider chose is
 *    remembered here. Screens must say this was recorded on this phone — it is
 *    the rider's own record, not the job's server state.
 *
 * Rider position is never written here. See AGENTS.md.
 */

const STORAGE_KEY = "gridgo.tripProof.v1";

export type ProofStep = "pickup" | "delivery" | "failed";

export type ProofDraft = {
  otp?: string;
  note?: string;
  receivedBy?: string;
  reasonId?: FailureReasonId;
  outcome?: FailureOutcome;
  /** ISO — chosen with a date/time picker, never typed. */
  nextAttemptAt?: string | null;
  contacted?: boolean | null;
  updatedAt: string;
};

export type RecordedAttempt = {
  reasonId: FailureReasonId;
  outcome: FailureOutcome;
  note: string;
  /** Timestamp the server put on the proof it accepted. */
  at: string;
  evidenceKind: "photo" | "signature" | null;
};

export type TripException = {
  attempts: RecordedAttempt[];
  outcome: FailureOutcome | null;
  returnedAt: string | null;
};

type Persisted = {
  drafts: Record<string, ProofDraft>;
  exceptions: Record<string, TripException>;
};

type TripProofState = Persisted & {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  getDraft: (orderId: string, step: ProofStep) => ProofDraft | null;
  saveDraft: (orderId: string, step: ProofStep, patch: Partial<ProofDraft>) => void;
  clearDraft: (orderId: string, step: ProofStep) => void;
  getException: (orderId: string) => TripException | null;
  recordAttempt: (orderId: string, attempt: RecordedAttempt) => void;
  recordReturned: (orderId: string, at: string) => void;
  clearException: (orderId: string) => void;
};

export function draftKey(orderId: string, step: ProofStep): string {
  return `${orderId}:${step}`;
}

const EMPTY_EXCEPTION: TripException = { attempts: [], outcome: null, returnedAt: null };

/** Shape a stored exception into what the phase ladder needs. */
export function exceptionSummary(
  exception: TripException | null | undefined,
): TripExceptionSummary | null {
  if (!exception) return null;
  return {
    attemptCount: exception.attempts.length,
    outcome: exception.outcome,
    returnedAt: exception.returnedAt,
  };
}

export const useTripProof = create<TripProofState>((set, get) => {
  let writeQueue: Promise<void> = Promise.resolve();

  function persist() {
    const { drafts, exceptions } = get();
    const payload = JSON.stringify({ drafts, exceptions } satisfies Persisted);
    // Serialise writes so a fast sequence of edits cannot land out of order.
    writeQueue = writeQueue.then(() =>
      AsyncStorage.setItem(STORAGE_KEY, payload).catch(() => {
        // The draft still applies in memory if the disk write fails.
      }),
    );
  }

  return {
    drafts: {},
    exceptions: {},
    hydrated: false,

    hydrate: async () => {
      if (get().hydrated) return;
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<Persisted>;
          set({
            drafts: parsed.drafts ?? {},
            exceptions: parsed.exceptions ?? {},
          });
        }
      } catch {
        // Corrupt or absent store — start clean rather than crash at the door.
      } finally {
        set({ hydrated: true });
      }
    },

    getDraft: (orderId, step) => get().drafts[draftKey(orderId, step)] ?? null,

    saveDraft: (orderId, step, patch) => {
      const key = draftKey(orderId, step);
      const current = get().drafts[key];
      const next: ProofDraft = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      set({ drafts: { ...get().drafts, [key]: next } });
      persist();
    },

    clearDraft: (orderId, step) => {
      const key = draftKey(orderId, step);
      if (!get().drafts[key]) return;
      const next = { ...get().drafts };
      delete next[key];
      set({ drafts: next });
      persist();
    },

    getException: (orderId) => get().exceptions[orderId] ?? null,

    recordAttempt: (orderId, attempt) => {
      const current = get().exceptions[orderId] ?? EMPTY_EXCEPTION;
      const next: TripException = {
        attempts: [...current.attempts, attempt],
        outcome: attempt.outcome,
        // A fresh attempt reopens the job even if a return was logged before.
        returnedAt: attempt.outcome === "return" ? current.returnedAt : null,
      };
      set({ exceptions: { ...get().exceptions, [orderId]: next } });
      persist();
    },

    recordReturned: (orderId, at) => {
      const current = get().exceptions[orderId] ?? EMPTY_EXCEPTION;
      set({
        exceptions: {
          ...get().exceptions,
          [orderId]: { ...current, outcome: "return", returnedAt: at },
        },
      });
      persist();
    },

    clearException: (orderId) => {
      if (!get().exceptions[orderId]) return;
      const next = { ...get().exceptions };
      delete next[orderId];
      set({ exceptions: next });
      persist();
    },
  };
});
