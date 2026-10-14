/**
 * Why a rider's position might not be reaching the shop or the client, and
 * how to fix it on this phone.
 *
 * The server cannot see a phone's permissions or battery settings, and it
 * cannot make a paused app send anything (gridgo-api#217). The phone can, so it
 * says so in the rider's words while a job is being tracked, with the steps
 * and the one button that leads to the fix.
 *
 * Pure: `hooks/useLocationHealth.ts` reads the phone, `LocationHealthCard`
 * draws the answer.
 */

export type PermissionAnswer = "granted" | "denied" | "undetermined" | "unknown";

export type LocationHealthInput = {
  platform: string;
  /** The phone-wide location switch. Null when it could not be read. */
  servicesEnabled: boolean | null;
  foreground: PermissionAnswer;
  /** Whether the system dialog can still be shown for foreground location. */
  canAskForeground: boolean;
  /** Android "Use precise location" / iOS "Precise Location". Null if unknown. */
  precise: boolean | null;
  /** Android may pause GRIDGO in the background to save battery. */
  batteryOptimized: boolean | null;
  /** Battery saver (Android) or Low Power Mode (iOS) is on. */
  lowPower: boolean | null;
};

export type LocationFix =
  | "ask_location"
  | "open_app_settings"
  | "turn_on_location"
  | "battery_settings"
  | "battery_saver_settings";

export type LocationIssueKey =
  | "location_off"
  | "permission_off"
  | "precise_off"
  | "battery_optimized"
  | "low_power";

export type LocationIssue = {
  key: LocationIssueKey;
  /** `blocking`: nothing is shared. `limited`: sharing can stop or blur. */
  severity: "blocking" | "limited";
  title: string;
  body: string;
  /** In order. Each one is something to tap or choose. */
  steps: string[];
  action: { label: string; fix: LocationFix } | null;
};

type Watcher = "shop" | "client";

function isNative(platform: string): boolean {
  return platform === "android" || platform === "ios";
}

/**
 * The settings path that allows location and precision, per platform.
 *
 * "While using the app" is enough and is what the steps ask for: the job's
 * location service is started with GRIDGO on screen, which Android and iOS
 * both count as in use for as long as it runs (`lib/backgroundLocation.ts`).
 * Asking for "all the time" would buy nothing this app uses.
 */
function settingsSteps(platform: string, want: "allow" | "precise"): string[] {
  if (platform === "ios") {
    if (want === "precise") return ["Tap Open settings.", "Tap Location.", "Turn on Precise Location."];
    return ["Tap Open settings.", "Tap Location.", "Choose While Using the App, and turn on Precise Location."];
  }
  if (want === "precise") return ["Tap Open settings.", "Tap Permissions, then Location.", "Turn on Use precise location."];
  return ["Tap Open settings.", "Tap Permissions, then Location.", "Choose Allow only while using the app, and turn on Use precise location."];
}

/**
 * Everything wrong with this phone's location, most serious first.
 *
 * Only native phones are judged on the location switch, precision and
 * battery: a browser has none of those, so it is never told to find them.
 */
export function locationIssues(input: LocationHealthInput, watcher: Watcher = "client"): LocationIssue[] {
  const issues: LocationIssue[] = [];
  const { platform } = input;
  const native = isNative(platform);

  if (native && input.servicesEnabled === false) {
    issues.push({
      key: "location_off",
      severity: "blocking",
      title: "Location is off on this phone",
      body: "Location is switched off for every app on this phone, GRIDGO included.",
      steps:
        platform === "ios"
          ? ["Open Settings, then Privacy & Security.", "Tap Location Services and turn it on."]
          : ["Tap Turn on location.", "Choose Turn on in the box that opens."],
      action: platform === "ios" ? null : { label: "Turn on location", fix: "turn_on_location" },
    });
  }

  if (input.foreground === "denied" || (native && input.foreground === "undetermined")) {
    // A browser that said no cannot be asked again from the page.
    const canAsk = input.foreground === "undetermined" || (native && input.canAskForeground);
    issues.push({
      key: "permission_off",
      severity: "blocking",
      title: "GRIDGO cannot use your location",
      body: "This phone does not let GRIDGO read where you are.",
      steps: canAsk
        ? [
            "Tap Allow location.",
            platform === "ios" ? "Choose Allow While Using App." : "Choose While using the app.",
            "Keep Precise on.",
          ]
        : platform === "web"
          ? ["Open this site's settings in your browser.", "Allow location, then come back."]
          : settingsSteps(platform, "allow"),
      action: canAsk
        ? { label: "Allow location", fix: "ask_location" }
        : native
          ? { label: "Open settings", fix: "open_app_settings" }
          : null,
    });
    // Nothing below matters until location is allowed at all.
    return issues;
  }

  if (!native || input.foreground !== "granted") return issues;

  if (input.precise === false) {
    issues.push({
      key: "precise_off",
      severity: "limited",
      title: "Precise location is off",
      body: `Your position can be off by a kilometre or more, so the ${watcher} sees you in the wrong place.`,
      steps: settingsSteps(platform, "precise"),
      action: { label: "Open settings", fix: "open_app_settings" },
    });
  }

  if (platform === "android" && input.batteryOptimized === true) {
    issues.push({
      key: "battery_optimized",
      severity: "limited",
      title: "Battery saving can pause GRIDGO",
      body: "Your phone may stop GRIDGO in the background to save battery, and your location stops with it.",
      steps: [
        "Tap Open battery settings.",
        "Show All apps, then find GRIDGO Rider.",
        "Choose Don't optimise (on some phones, Unrestricted).",
      ],
      action: { label: "Open battery settings", fix: "battery_settings" },
    });
  }

  if (input.lowPower === true) {
    issues.push({
      key: "low_power",
      severity: "limited",
      title: platform === "ios" ? "Low Power Mode is on" : "Battery saver is on",
      body: "Your phone sends your location less often while it is on.",
      steps:
        platform === "ios"
          ? ["Open Settings, then Battery.", "Turn Low Power Mode off while you deliver."]
          : ["Tap Open battery saver.", "Turn Battery saver off while you deliver."],
      action: platform === "ios" ? null : { label: "Open battery saver", fix: "battery_saver_settings" },
    });
  }

  return issues;
}

/**
 * The card's headline: what the problem costs, said from the side of the
 * person watching. One blocking issue means nothing is shared at all.
 */
export function locationHealthHeadline(
  issues: LocationIssue[],
  watcher: Watcher = "client",
): { title: string; body: string; tone: "error" | "warning" } | null {
  if (issues.length === 0) return null;
  const blocking = issues.some((issue) => issue.severity === "blocking");
  const count = issues.length === 1 ? "this" : `these ${issues.length} things`;
  return blocking
    ? {
        title: `The ${watcher} cannot see you coming`,
        body: `Your location is not being shared. Fix ${count} to turn it back on.`,
        tone: "error",
      }
    : {
        title: `Your location may stop reaching the ${watcher}`,
        body: `Fix ${count} so sharing keeps going until the job is done.`,
        tone: "warning",
      };
}
