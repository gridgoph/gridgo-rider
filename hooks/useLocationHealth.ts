import * as Battery from "expo-battery";
import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";

import {
  locationIssues,
  type LocationFix,
  type LocationHealthInput,
  type LocationIssue,
  type PermissionAnswer,
} from "@/lib/locationHealth";
import { openAppSettings, openPhoneSettings } from "@/lib/phoneSettings";

/** How often a visible card re-reads switches the rider can flip from quick settings. */
export const LOCATION_HEALTH_POLL_MS = 15_000;

async function settle<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch {
    return fallback;
  }
}

function permissionAnswer(status: string | undefined): PermissionAnswer {
  return status === "granted" || status === "denied" || status === "undetermined" ? status : "unknown";
}

/** Read every switch that decides whether this phone can share a position. */
export async function readLocationHealth(platform: string = Platform.OS): Promise<LocationHealthInput> {
  const [servicesEnabled, permission, batteryOptimized, lowPower] = await Promise.all([
    settle<boolean | null>(() => Location.hasServicesEnabledAsync(), null),
    settle<Location.LocationPermissionResponse | null>(() => Location.getForegroundPermissionsAsync(), null),
    platform === "android"
      ? settle<boolean | null>(() => Battery.isBatteryOptimizationEnabledAsync(), null)
      : Promise.resolve(null),
    platform === "android" || platform === "ios"
      ? settle<boolean | null>(() => Battery.isLowPowerModeEnabledAsync(), null)
      : Promise.resolve(null),
  ]);
  const accuracy = permission?.android?.accuracy ?? permission?.ios?.accuracy ?? null;
  return {
    platform,
    servicesEnabled,
    foreground: permissionAnswer(permission?.status),
    canAskForeground: permission?.canAskAgain !== false,
    precise: accuracy == null ? null : accuracy === "fine" || accuracy === "full",
    batteryOptimized,
    lowPower,
  };
}

/**
 * What stands between this phone and the client (or shop) seeing the rider,
 * read while a job is tracked: on start, on every return to GRIDGO (the rider
 * may have just fixed something in settings), and every few seconds while on
 * screen, because the location and battery-saver switches live in quick
 * settings and flipping them does not leave the app.
 */
export function useLocationHealth({
  enabled,
  watcher,
}: {
  enabled: boolean;
  watcher: "shop" | "client";
}): { issues: LocationIssue[]; fix: (fix: LocationFix) => Promise<void> } {
  const [health, setHealth] = useState<LocationHealthInput | null>(null);

  const refresh = useCallback(async () => {
    const next = await readLocationHealth();
    setHealth(next);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let active = AppState.currentState === "active";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reads the phone on start: state lands after the native answers.
    void refresh();
    const timer = setInterval(() => {
      if (active) void refresh();
    }, LOCATION_HEALTH_POLL_MS);
    const sub = AppState.addEventListener("change", (state) => {
      active = state === "active";
      if (active) void refresh();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [enabled, refresh]);

  const fix = useCallback(
    async (action: LocationFix) => {
      switch (action) {
        case "ask_location":
          await settle(() => Location.requestForegroundPermissionsAsync(), null);
          break;
        case "turn_on_location":
          // Android's own "turn on location" box, without leaving GRIDGO.
          try {
            await Location.enableNetworkProviderAsync();
          } catch {
            await openPhoneSettings("location");
          }
          break;
        case "battery_settings":
          await openPhoneSettings("battery");
          break;
        case "battery_saver_settings":
          await openPhoneSettings("batterySaver");
          break;
        case "open_app_settings":
          await openAppSettings();
          break;
      }
      await refresh();
    },
    [refresh],
  );

  return { issues: enabled && health ? locationIssues(health, watcher) : [], fix };
}
