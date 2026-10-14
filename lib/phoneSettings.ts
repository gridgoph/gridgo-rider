import Constants from "expo-constants";
import { Linking, Platform } from "react-native";

/**
 * Open the one phone settings screen that can fix a problem.
 *
 * Android names its screens by intent action, so a rider can land on the
 * exact switch (this app's alert channel, the battery list, the location
 * toggle) instead of being told to hunt through Settings. Any action this
 * phone does not have falls back to GRIDGO's own app settings page, which
 * every Android and iOS phone has. Nothing here throws: a settings link that
 * fails is a rider with no way forward, so the fallback always runs.
 */

/** Android intent actions this app opens. */
export const ANDROID_SETTINGS = {
  /** One notification channel: its sound, importance and on/off switch. */
  channel: "android.settings.CHANNEL_NOTIFICATION_SETTINGS",
  /** The phone-wide location switch. */
  location: "android.settings.LOCATION_SOURCE_SETTINGS",
  /** The list of apps the phone may pause to save battery. */
  battery: "android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS",
  /** The phone-wide battery saver switch. */
  batterySaver: "android.settings.BATTERY_SAVER_SETTINGS",
} as const;

export type AndroidSettingsScreen = keyof typeof ANDROID_SETTINGS;

/** This build's Android package, e.g. `ph.gridgo.rider`. */
export function androidPackage(): string | null {
  return Constants.expoConfig?.android?.package ?? null;
}

/** Extras a screen needs to open on this app rather than on a list. */
export function androidSettingsExtras(
  screen: AndroidSettingsScreen,
  packageName: string | null,
  channelId?: string,
): { key: string; value: string }[] {
  if (screen !== "channel" || !packageName) return [];
  return [
    { key: "android.provider.extra.APP_PACKAGE", value: packageName },
    ...(channelId ? [{ key: "android.provider.extra.CHANNEL_ID", value: channelId }] : []),
  ];
}

/** GRIDGO's own page in the phone's settings. */
export async function openAppSettings(): Promise<void> {
  await Linking.openSettings().catch(() => undefined);
}

/**
 * The named Android screen, or GRIDGO's app settings page when this phone
 * (or platform) has no such screen.
 */
export async function openPhoneSettings(
  screen: AndroidSettingsScreen,
  options: { channelId?: string } = {},
): Promise<void> {
  if (Platform.OS === "android") {
    try {
      await Linking.sendIntent(
        ANDROID_SETTINGS[screen],
        androidSettingsExtras(screen, androidPackage(), options.channelId),
      );
      return;
    } catch {
      // A phone without this screen. The app page below always exists.
    }
  }
  await openAppSettings();
}
