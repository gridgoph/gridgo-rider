import { useEffect } from "react";
import { AppState } from "react-native";

import { useTesterProgram } from "@/store/testerProgram";

/**
 * A Google Play tester's open is the day's check-in (gridgo-api
 * `docs/TESTER_PROGRAM_API.md`): on reaching the tabs, on an account change,
 * and on every return to the front — a new Manila day often starts with the
 * app already running. Nothing visible for anyone who is not enrolled.
 *
 * Mounted in the tab shell, so it runs only for a signed-in rider, whatever
 * tab or trip step is in front.
 */
export function useTesterCheckIn(userId: string | null): void {
  useEffect(() => {
    if (!userId) return;
    void useTesterProgram.getState().load(userId);
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void useTesterProgram.getState().load(userId);
    });
    return () => subscription.remove();
  }, [userId]);
}
