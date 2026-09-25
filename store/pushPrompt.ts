import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import {
  EMPTY_PUSH_PROMPT_MEMORY,
  PUSH_PROMPT_STORAGE_KEY,
  parsePushPromptMemory,
  type PushPromptMemory,
} from "@/lib/push";

/**
 * Where the notifications explainer meets storage and the navigator.
 *
 * The rule is `shouldOfferPushPrompt` in `lib/push.ts`; `hooks/usePushPrompt.ts`
 * decides when to present, and `app/push-permission.tsx` is the sheet.
 *
 * The offer is recorded when the sheet is *presented*, not when it is
 * answered: dragging it away, the back gesture and "Not now" are all the same
 * answer, and a phone that crashed with the sheet up has still been asked.
 */

type PushPromptState = {
  memory: PushPromptMemory;
  hydrated: boolean;
  /** The sheet is on screen. Set before the route is pushed. */
  open: boolean;
  /** The memory from before this presentation, restored if it is interrupted. */
  previous: PushPromptMemory | null;
};

export const usePushPromptStore = create<PushPromptState>(() => ({
  memory: EMPTY_PUSH_PROMPT_MEMORY,
  hydrated: false,
  open: false,
  previous: null,
}));

let hydration: Promise<void> | null = null;

export function hydratePushPrompt(): Promise<void> {
  hydration ??= AsyncStorage.getItem(PUSH_PROMPT_STORAGE_KEY)
    .then((raw) => usePushPromptStore.setState({ memory: parsePushPromptMemory(raw) }))
    .catch(() => {
      // Storage that will not answer costs the memory, never the launch.
    })
    .finally(() => usePushPromptStore.setState({ hydrated: true }));
  return hydration;
}

function persist(memory: PushPromptMemory): void {
  void AsyncStorage.setItem(PUSH_PROMPT_STORAGE_KEY, JSON.stringify(memory)).catch(() => {});
}

/** The sheet is about to be pushed. Remember that this phone has been asked. */
export function openPushPrompt(nowMs: number): void {
  const { memory } = usePushPromptStore.getState();
  const next = { offeredAtMs: nowMs };
  usePushPromptStore.setState({ open: true, previous: memory, memory: next });
  persist(next);
}

/**
 * The sheet has gone. `interrupted` is the root stack re-keying under it (an
 * account change) with nobody answering, so it is offered again rather than
 * put off for a week.
 */
export function closePushPrompt(outcome: "answered" | "interrupted"): void {
  const { open, previous } = usePushPromptStore.getState();
  if (!open) return;
  if (outcome === "interrupted" && previous) {
    usePushPromptStore.setState({ open: false, previous: null, memory: previous });
    persist(previous);
    return;
  }
  usePushPromptStore.setState({ open: false, previous: null });
}

/** Tests only: forget the hydration so a fresh storage read runs. */
export function resetPushPromptForTests(): void {
  hydration = null;
  usePushPromptStore.setState({
    memory: EMPTY_PUSH_PROMPT_MEMORY,
    hydrated: false,
    open: false,
    previous: null,
  });
}
