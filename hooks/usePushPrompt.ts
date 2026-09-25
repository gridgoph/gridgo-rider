import { router, useRootNavigationState, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { shouldOfferPushPrompt } from "@/lib/push";
import { nextUpdateSheet, useAppUpdate } from "@/store/appUpdate";
import { usePush } from "@/store/push";
import { hydratePushPrompt, openPushPrompt, usePushPromptStore } from "@/store/pushPrompt";
import { isSignedIn, useSession } from "@/store/session";
import { afterNativePresentation, useSheets } from "@/store/sheets";

/**
 * Why a due explainer is being held back, or `null` when it may be presented.
 *
 * It opens only over the tab shell — the screen a rider lands on after
 * signing in or launching — never over a proof step, a sign-in screen or
 * another sheet. A waiting update sheet goes first: two sheets queued is fine,
 * two stacked is a question nobody asked.
 */
export function pushPromptHold(input: {
  ready: boolean;
  navigatorReady: boolean;
  appState: AppStateStatus;
  confirmOpen: boolean;
  updateSheet: boolean;
  segments: readonly string[];
}): string | null {
  if (!input.ready) return "the opening is still playing";
  if (!input.navigatorReady) return "the navigator has not mounted";
  if (input.appState !== "active") return `the app is ${input.appState}, not in front`;
  if (input.confirmOpen) return "another sheet is open";
  if (input.updateSheet) return "the update sheet goes first";
  if (input.segments[0] !== "(tabs)") return "not on a tab";
  return null;
}

/**
 * Present the notifications explainer once a signed-in rider reaches the tabs,
 * and again no sooner than a week after they last saw it, while the phone
 * still has notifications off. The sheet's own button raises the OS dialog;
 * nothing here does.
 */
export function usePushPrompt({ ready }: { ready: boolean }): void {
  const [appState, setAppState] = useState<AppStateStatus>(() => AppState.currentState);
  const segments = useSegments();
  const navigatorReady = Boolean(useRootNavigationState()?.key);
  const confirmOpen = useSheets((s) => Boolean(s.confirm && !s.confirm.settled));
  const updateSheet = useAppUpdate((s) => Boolean(s.open || nextUpdateSheet(s)));

  const user = useSession((s) => s.user);
  const settled = useSession((s) => !s.loading && !s.sessionWait);
  const supported = usePush((s) => s.supported);
  const permission = usePush((s) => s.permission);
  const memory = usePushPromptStore((s) => s.memory);
  const hydrated = usePushPromptStore((s) => s.hydrated);
  const open = usePushPromptStore((s) => s.open);

  useEffect(() => {
    void hydratePushPrompt();
    const sub = AppState.addEventListener("change", setAppState);
    return () => sub.remove();
  }, []);

  // `Date.now()` in render is safe here: a week-long window does not care
  // which frame read the clock, and a return to the foreground re-renders.
  const due =
    hydrated &&
    settled &&
    shouldOfferPushPrompt({
      supported,
      signedIn: isSignedIn(user),
      permission,
      memory,
      nowMs: Date.now(),
    });
  const presentable =
    pushPromptHold({ ready, navigatorReady, appState, confirmOpen, updateSheet, segments }) === null;

  useEffect(() => {
    if (!due || !presentable || open) return;
    let cancelled = false;
    // Let a sheet that just closed finish leaving before this one arrives.
    void afterNativePresentation().then(() => {
      if (cancelled || usePushPromptStore.getState().open) return;
      openPushPrompt(Date.now());
      router.push("/push-permission");
    });
    return () => {
      cancelled = true;
    };
  }, [due, presentable, open]);
}
