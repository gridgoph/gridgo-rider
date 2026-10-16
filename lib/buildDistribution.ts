import { Platform } from "react-native";

import { parseAppDistribution, type AppDistribution } from "@/lib/appUpdate";

/**
 * This build's distribution: `play` only in the Google Play bundle CI builds
 * with `EXPO_PUBLIC_APP_DISTRIBUTION=play`, otherwise the side-load APK.
 *
 * Read as the literal `process.env.EXPO_PUBLIC_…` so Babel inlines it at
 * bundle time; a member access on `env` would never be replaced.
 */
export function buildDistribution(): AppDistribution {
  return parseAppDistribution(process.env.EXPO_PUBLIC_APP_DISTRIBUTION);
}

/**
 * How this install arrived, as `POST /devices` reports it (`installChannel`).
 *
 * The server sends each release notice only to installs on that channel, so a
 * Play or TestFlight tester hears about a version once their store has it,
 * never when the APK lands (gridgo-api `docs/RELEASE_ANNOUNCEMENTS_API.md`).
 * An iPhone build can only have come from TestFlight; an Android build is the
 * Play bundle when CI said so, and the side-load APK otherwise. Web is not an
 * install and reports nothing.
 */
export type InstallChannel = "apk" | "play" | "ios";

export function installChannel(
  os: string = Platform.OS,
  distribution: AppDistribution = buildDistribution(),
): InstallChannel | null {
  if (os === "ios") return "ios";
  if (os !== "android") return null;
  return distribution === "play" ? "play" : "apk";
}
