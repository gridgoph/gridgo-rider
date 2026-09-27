import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import type { PickupCheckCode } from "@/lib/api";
import type { SignatureDraft } from "@/lib/handoffSignature";
import { allAnswered, EMPTY_ANSWERS, type ChecklistAnswers } from "@/lib/pickupChecklist";
import type { CountDraft } from "@/lib/pickupCount";

/**
 * Proof work in progress, kept across an app restart.
 *
 * Riders lose the app to a phone call, a dead battery, or Android reclaiming
 * memory in a stairwell. Re-running six checks at a counter because the app
 * restarted is how a rider learns to tick all six without looking, which is the
 * one failure mode the checklist cannot survive.
 *
 * Typed and chosen values only. A captured photo lives in a cache the system
 * can reclaim, so promising it is still there would be a lie — and the name of
 * a file the server may not have is exactly the kind of claim this flow exists
 * to prevent. The supplier's signature is kept as the strokes that drew it,
 * which are numbers rather than a file, and redrawn on the pad; the one file
 * id kept is one the server has already confirmed and attached.
 *
 * Rider position is never written here. See AGENTS.md.
 */

const STORAGE_KEY = "gridgo.tripProof.v2";

export type ChecklistDraft = {
  answers: ChecklistAnswers;
  failureNote: string;
  /** Pieces counted per line, keyed by `countKey`. Absent until one is typed. */
  counts?: CountDraft;
  updatedAt: string;
  /**
   * When the checks were finished — the moment the attestation names. Set by
   * `markChecked` as the rider hands the phone over (or by the sixth tap on an
   * API without counts), and reset by any later answer or count.
   */
  completedAt?: string | null;
  /** The supplier's signature in progress. Absent until the pad is touched. */
  signature?: SignatureDraft;
};

type Persisted = {
  checklists: Record<string, ChecklistDraft>;
};

type TripProofState = Persisted & {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  getChecklist: (orderId: string) => ChecklistDraft | null;
  answerCheck: (orderId: string, code: PickupCheckCode, passed: boolean) => void;
  saveFailureNote: (orderId: string, note: string) => void;
  /** One line's count; null clears it. Never prefilled from the expected number. */
  saveCount: (orderId: string, key: string, counted: number | null) => void;
  /** Stamp the moment the checks and count were finished. */
  markChecked: (orderId: string) => void;
  saveSignature: (orderId: string, patch: Partial<SignatureDraft>) => void;
  clearChecklist: (orderId: string) => void;
};

const EMPTY_SIGNATURE: SignatureDraft = {
  strokes: [],
  padWidth: 0,
  signerName: "",
  storedFileId: null,
};

function emptyDraft(): ChecklistDraft {
  return { answers: { ...EMPTY_ANSWERS }, failureNote: "", updatedAt: new Date().toISOString() };
}

export const useTripProof = create<TripProofState>((set, get) => {
  let writeQueue: Promise<void> = Promise.resolve();

  function persist() {
    const payload = JSON.stringify({ checklists: get().checklists } satisfies Persisted);
    // Serialise writes so a fast sequence of taps cannot land out of order.
    writeQueue = writeQueue.then(() =>
      AsyncStorage.setItem(STORAGE_KEY, payload).catch(() => {
        // The draft still applies in memory if the disk write fails.
      }),
    );
  }

  function update(orderId: string, patch: Partial<ChecklistDraft>) {
    const current = get().checklists[orderId] ?? emptyDraft();
    const next: ChecklistDraft = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    set({ checklists: { ...get().checklists, [orderId]: next } });
    persist();
  }

  return {
    checklists: {},
    hydrated: false,

    hydrate: async () => {
      if (get().hydrated) return;
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<Persisted>;
          set({ checklists: parsed.checklists ?? {} });
        }
      } catch {
        // Corrupt or absent store — start clean rather than crash at the counter.
      } finally {
        set({ hydrated: true });
      }
    },

    getChecklist: (orderId) => get().checklists[orderId] ?? null,

    answerCheck: (orderId, code, passed) => {
      const current = get().checklists[orderId] ?? emptyDraft();
      const answers = { ...current.answers, [code]: passed };
      update(orderId, {
        answers,
        completedAt: allAnswered(answers) ? new Date().toISOString() : null,
      });
    },

    saveFailureNote: (orderId, note) => update(orderId, { failureNote: note }),

    saveCount: (orderId, key, counted) => {
      const current = get().checklists[orderId] ?? emptyDraft();
      update(orderId, { counts: { ...current.counts, [key]: counted }, completedAt: null });
    },

    markChecked: (orderId) => update(orderId, { completedAt: new Date().toISOString() }),

    saveSignature: (orderId, patch) => {
      const current = get().checklists[orderId] ?? emptyDraft();
      const signature: SignatureDraft = { ...(current.signature ?? EMPTY_SIGNATURE), ...patch };
      update(orderId, { signature });
    },

    clearChecklist: (orderId) => {
      if (!get().checklists[orderId]) return;
      const next = { ...get().checklists };
      delete next[orderId];
      set({ checklists: next });
      persist();
    },
  };
});
