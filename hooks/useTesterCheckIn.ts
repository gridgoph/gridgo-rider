import { useEffect } from "react";
import { AppState } from "react-native";

import { usePlayOptIn } from "@/store/playOptIn";
import { useTesterProgram } from "@/store/testerProgram";

/**
 * A Google Play tester's open is the day's check-in (gridgo-api
 * `docs/TESTER_PROGRAM_API.md`): on reaching the tabs, on an account change,
 * and on every return to the front — a new Manila day often starts with the
 * app already running. Nothing visible for anyone who is not enrolled.
 *
 * The Play opt-in read goes first (`docs/PLAY_OPTIN_API.md`): it is also this
 * install's report, and a Play build's report is what enrols the rider, so the
 * tester read after it sees today's run and checks in on the same open.
 *
 * Mounted in the tab shell, so it runs only for a signed-in rider, whatever
 * tab or trip step is in front.
 */
export function useTesterCheckIn(userId: string | null): void {
  useEffect(() => {
    if (!userId) return;
    const read = () =>
      void usePlayOptIn
        .getState()
        .load(userId)
        .finally(() => useTesterProgram.getState().load(userId));
    read();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") read();
    });
    return () => subscription.remove();
  }, [userId]);
}
