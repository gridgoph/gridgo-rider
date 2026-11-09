import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

import { parseForcedVersionCode, type AppBuild } from "./appUpdate";
import { appHeaderValue, appIdentity, riderBuild, type AppIdentity } from "./minimumBuild";

/**
 * This build, as it names itself to GRIDGO. Read once: none of it changes
 * while the app runs.
 *
 * `EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE` is spelled as the literal
 * member expression on purpose: Expo inlines only that shape at bundle time.
 */
let cached: { build: AppBuild | null; identity: AppIdentity | null } | null = null;

function read() {
  if (cached) return cached;
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
  cached = {
    build: riderBuild(input),
    identity: appIdentity({ ...input, iosBuildNumber: Constants.platform?.ios?.buildNumber }),
  };
  return cached;
}

/** The build compared with the published rider minimum (Android), or `null`. */
export function currentRiderBuild(): AppBuild | null {
  return read().build;
}

/**
 * The `X-GRIDGO-App` header for every request to the API, or none. Spread it
 * into a request's headers: `{ ...appHeaders(), ... }`.
 */
export function appHeaders(): Record<string, string> {
  const value = appHeaderValue(read().identity);
  return value ? { "X-GRIDGO-App": value } : {};
}

/** Test seam: read the build again. */
export function resetAppIdentityForTests(): void {
  cached = null;
}
