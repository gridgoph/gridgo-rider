import Constants, { ExecutionEnvironment } from "expo-constants";
import { router, useRootNavigationState, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";

import {
  describeInstalledBuild,
  installedBuild,
  parseForcedVersionCode,
  type AppBuild,
} from "@/lib/appUpdate";
import {
  checkForAppUpdate,
  logUpdateCheck,
  nextUpdateSheet,
  openUpdateSheet,
  startAppUpdate,
  useAppUpdate,
} from "@/store/appUpdate";
import { afterNativePresentation, useSheets } from "@/store/sheets";

/**
 * The build on this phone, read once.
 *
 * `EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE` is spelled as the literal
 * member expression on purpose: Expo inlines only that shape at bundle time.
 */
function readInstalledBuild(): AppBuild | null {
  const input = {
    platform: Platform.OS,
    expoGo: Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
    dev: __DEV__,
    versionName: Constants.expoConfig?.version,
    versionCode: Constants.expoConfig?.android?.versionCode,
    forcedVersionCode: parseForcedVersionCode(
      process.env.EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE,
    ),
  };
  const build = installedBuild(input);
  logUpdateCheck(describeInstalledBuild(input, build));
  return build;
}

/**
 * Routes the sheet must not open over: the launch redirect and SSO return,
 * which are about to be replaced, and the other sheets, because two sheets
 * stacked is a question nobody asked.
 */
const NOT_OVER = new Set(["", "sso-callback", "confirm", "app-update", "push-permission", "trip/start"]);

export function canPresentUpdateSheet(segments: readonly string[]): boolean {
  return !NOT_OVER.has(segments.join("/"));
}

/**
 * Why a waiting sheet is being held back, or `null` when it may be presented.
 * The reason goes to the development log, so a sheet that never appears says
 * which gate it is standing at.
 */
export function updateSheetHold(input: {
  ready: boolean;
  navigatorReady: boolean;
  appState: AppStateStatus;
  confirmOpen: boolean;
  segments: readonly string[];
}): string | null {
  if (!input.ready) return "the opening is still playing";
  if (!input.navigatorReady) return "the navigator has not mounted";
  if (input.appState !== "active") return `the app is ${input.appState}, not in front`;
  if (input.confirmOpen) return "another sheet is open";
  if (!canPresentUpdateSheet(input.segments)) {
    return `route "/${input.segments.join("/")}" is about to be replaced or is a sheet`;
  }
  return null;
}

/**
 * Tell the rider when a newer GRIDGO is published, and once after it lands.
 *
 * Mounted from the root shell so it runs signed in or out: an old build has to
 * be replaceable by someone who cannot sign in to it. Reads on launch and on
 * return to the foreground (throttled in `lib/appUpdate.ts`); presents only
 * once the opening has finished, the launch redirect has landed, the app is in
 * front and no other sheet is up.
 *
 * Development builds and Expo Go have no real `versionCode`, so this does
 * nothing there unless `EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE` is set.
 * A development build logs every decision as an `[update-check]` line.
 */
export function useAppUpdateCheck({ ready }: { ready: boolean }): void {
  const [installed] = useState(readInstalledBuild);
  const [appState, setAppState] = useState<AppStateStatus>(() => AppState.currentState);

  const segments = useSegments();
  const rootNavigatorKey = useRootNavigationState()?.key;
  const confirmOpen = useSheets((s) => Boolean(s.confirm && !s.confirm.settled));
  const pending = useAppUpdate((s) => Boolean(nextUpdateSheet(s)));
  const open = useAppUpdate((s) => Boolean(s.open));

  useEffect(() => {
    if (!installed) return;
    void startAppUpdate(installed);
    const sub = AppState.addEventListener("change", (next) => {
      setAppState(next);
      if (next === "active") void checkForAppUpdate(installed);
    });
    return () => sub.remove();
  }, [installed]);

  const hold = updateSheetHold({
    ready,
    navigatorReady: Boolean(rootNavigatorKey),
    appState,
    confirmOpen,
    segments,
  });
  const presentable = hold === null;

  // Once per change of reason, and only while something is waiting to be shown.
  const waitingReason = pending && !open ? hold : null;
  useEffect(() => {
    if (waitingReason) logUpdateCheck(`holding the sheet: ${waitingReason}`);
  }, [waitingReason]);

  useEffect(() => {
    if (!presentable || !pending || open) return;
    let cancelled = false;
    // Let a sheet that just closed finish leaving before the next one arrives.
    void afterNativePresentation().then(() => {
      if (cancelled) return;
      const sheet = openUpdateSheet();
      if (!sheet) return;
      logUpdateCheck(`presenting the ${sheet.kind === "available" ? "update" : "update completed"} sheet`);
      router.push("/app-update");
    });
    return () => {
      cancelled = true;
    };
  }, [presentable, pending, open]);
}
