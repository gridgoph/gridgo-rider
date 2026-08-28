import { router } from "expo-router";
import { InteractionManager } from "react-native";
import { create } from "zustand";

/**
 * Sheets the app asks for and waits on.
 *
 * A confirmation is a route, not an overlay drawn on top of a screen:
 * presenting it through the navigator is what buys the platform's own sheet
 * physics, drag-to-dismiss, back gesture and scrim, and what makes a screen
 * reader land inside the sheet instead of behind it.
 *
 * A caller awaits the answer — `const ok = await askConfirm(...)` — so the
 * call site reads as one decision rather than three pieces of visibility state.
 * Dismissing a sheet any way the platform allows resolves it as declined, which
 * is always the safe outcome: nothing is committed until the sheet's own action
 * is pressed.
 */

export type ConfirmRequest = {
  /** A specific question naming the thing: "Sign out of GRIDGO on this phone?" */
  question: string;
  /** What happens next, in one or two sentences. */
  consequence: string;
  /** The verb that goes ahead. Matches the verb that opened the sheet. */
  confirmLabel: string;
  /** The verb that backs out. Never a bare "Cancel" for a destructive choice. */
  cancelLabel: string;
  destructive?: boolean;
};

type Pending<TRequest, TResult> = {
  request: TRequest;
  resolve: (value: TResult) => void;
  settled: boolean;
} | null;

type SheetState = {
  confirm: Pending<ConfirmRequest, boolean>;
};

export const useSheets = create<SheetState>(() => ({
  confirm: null,
}));

/**
 * Wait until a native sheet has actually left.
 *
 * `router.back()` only *asks* the sheet to dismiss. On Android the wall
 * underneath is still a live native tree while that animation runs. Callers
 * continue only after the interaction queue drains.
 */
export function afterNativePresentation(): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      InteractionManager.runAfterInteractions(() => resolve());
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(finish));
    } else {
      finish();
    }
  });
}

export function askConfirm(request: ConfirmRequest): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    useSheets.setState({ confirm: { request, resolve, settled: false } });
    router.push("/confirm");
  }).then(async (answer) => {
    await afterNativePresentation();
    return answer;
  });
}

/** Resolve the open confirmation. Safe to call more than once. */
export function settleConfirm(answer: boolean): void {
  const pending = useSheets.getState().confirm;
  if (!pending || pending.settled) return;
  useSheets.setState({ confirm: { ...pending, settled: true } });
  pending.resolve(answer);
}
