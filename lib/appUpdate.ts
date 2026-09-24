/**
 * In-app update prompt: everything decidable without React Native.
 *
 * GRIDGO is sideloaded, so no store tells a phone that a newer APK exists.
 * Every merge to `main` builds one whose `versionCode` is the CI run number and
 * whose version is `MAJOR.MINOR.<run>` (`app.config.ts`), publishes it as the
 * GitHub Release `v<version>`, and puts the same file on the landing site. This
 * module reads the latest release, compares its run number with the installed
 * `versionCode`, and decides what the phone is told.
 *
 * Android's installer owns the install itself, so the app never sees the
 * moment an update lands. "Update completed" is therefore said on the first
 * launch of the new build, by comparing the installed `versionCode` with the
 * last one this phone ran.
 *
 * Nothing here imports React Native, Expo or a store, so the same file serves
 * gridgo-client and gridgo-supplier. **Only `APP_UPDATE_SOURCE` and the body
 * copy name this app.** `store/appUpdate.ts`, `hooks/useAppUpdateCheck.ts` and
 * `app/app-update.tsx` are the thin layer around it.
 */

/** Where this app's releases are published. */
export const APP_UPDATE_SOURCE = {
  latestReleaseUrl: "https://api.github.com/repos/gridgoph/gridgo-rider/releases/latest",
  /** The landing site's copy of the newest APK. Android's installer takes it from here. */
  downloadUrl: "https://gridgo.talasora.com/downloads/gridgo-rider.apk",
  /** Named in copy if the phone cannot open the download link itself. */
  downloadPage: "gridgo.talasora.com/download",
  /**
   * GitHub refuses an API request with no `User-Agent` (403, the same status
   * as its rate limit), so the read names itself rather than trusting the
   * phone's HTTP stack to add one.
   */
  userAgent: "GRIDGO-rider",
} as const;

/**
 * At most one release read per this long while the app keeps coming back to
 * the foreground. A cold launch always reads. Unauthenticated GitHub allows 60
 * reads an hour per IP, and riders on one shop's Wi-Fi share that.
 */
export const APP_UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/** A release read that has not answered by now is treated as offline. */
export const APP_UPDATE_FETCH_TIMEOUT_MS = 10_000;

export type AppBuild = {
  /** Android `versionCode`: the CI run number. */
  versionCode: number;
  /** What a person reads, e.g. "1.0.96". */
  versionName: string;
};

const RELEASE_TAG = /^v?(\d+)\.(\d+)\.(\d+)$/;
const RELEASE_LINE = /^(\d+)\.(\d+)(?:\.|$)/;

function wholeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1
    ? value
    : null;
}

/**
 * The build a release tag names, or `null` if the tag is not one CI writes.
 *
 * CI tags `v1.0.<run>` and the run number is the `versionCode`, so the numeric
 * suffix is the whole comparison. A hand-made tag of any other shape is ignored
 * rather than guessed at.
 */
export function releaseBuildFromTag(tag: unknown): AppBuild | null {
  if (typeof tag !== "string") return null;
  const match = RELEASE_TAG.exec(tag.trim());
  if (!match) return null;
  const versionCode = wholeNumber(Number(match[3]));
  if (versionCode === null) return null;
  return { versionCode, versionName: `${match[1]}.${match[2]}.${match[3]}` };
}

/** A whole number from 1 up, or `null`. Reads the dev override. */
export function parseForcedVersionCode(raw: string | null | undefined): number | null {
  const value = (raw ?? "").trim();
  if (!/^\d+$/.test(value)) return null;
  return wholeNumber(Number(value));
}

/** What the runtime says about itself, read by `installedBuild`. */
export type InstalledBuildInput = {
  platform: string;
  expoGo: boolean;
  dev: boolean;
  versionName: string | null | undefined;
  versionCode: number | null | undefined;
  forcedVersionCode: number | null;
};

/**
 * The build installed on this phone, or `null` when there is nothing honest
 * to compare.
 *
 * Only a CI release carries a real `versionCode`: `app.config.ts` stamps the
 * run number into both the code and the patch segment, so a release is
 * recognised by the two agreeing (`1.0.96` / `96`). A local build, a
 * development client and Expo Go report the `app.json` version with
 * `versionCode` 1 and are skipped — they would otherwise be told to "update"
 * to a release on every launch.
 *
 * `forcedVersionCode` (`EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE`) pretends
 * to be that build anywhere on Android, Expo Go included, so the prompt can be
 * seen on a phone without a release APK. CI never sets it, and it is inlined
 * at bundle time, so it cannot reach a release by accident.
 */
export function installedBuild(input: InstalledBuildInput): AppBuild | null {
  // The download is an APK; nothing else can install it.
  if (input.platform !== "android") return null;

  const versionName = (input.versionName ?? "").trim();
  const line = RELEASE_LINE.exec(versionName);

  if (input.forcedVersionCode !== null) {
    const release = line ? `${line[1]}.${line[2]}` : "1.0";
    return {
      versionCode: input.forcedVersionCode,
      versionName: `${release}.${input.forcedVersionCode}`,
    };
  }

  if (input.expoGo || input.dev || !line) return null;
  const code = wholeNumber(input.versionCode);
  if (code === null) return null;
  if (versionName !== `${line[1]}.${line[2]}.${code}`) return null;
  return { versionCode: code, versionName };
}

/** What one read of the latest release came back with. */
export type ReleaseRead = {
  /** The newest CI release, or `null` when there is nothing to offer. */
  latest: AppBuild | null;
  /**
   * Whether GitHub answered at all. `false` offline or on a timeout, which is
   * worth trying again at the next foreground rather than hours later.
   */
  answered: boolean;
  /** One line for the development log: what came back, and why it counts. */
  detail: string;
};

/**
 * Read the latest release. Never throws.
 *
 * Offline, a timeout, GitHub's rate limit (403/429), a repo with no release yet
 * (404) and a body that is not a CI tag all answer `latest: null`: an update
 * prompt is a courtesy, and failing to find one is not something to tell a
 * rider. `detail` says which, so a development build can show why nothing was
 * offered.
 */
export async function fetchLatestRelease(
  fetchImpl: typeof fetch,
  {
    url = APP_UPDATE_SOURCE.latestReleaseUrl,
    timeoutMs = APP_UPDATE_FETCH_TIMEOUT_MS,
  }: { url?: string; timeoutMs?: number } = {},
): Promise<ReleaseRead> {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let answered = false;
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": APP_UPDATE_SOURCE.userAgent,
      },
      signal: controller?.signal,
    });
    answered = true;
    if (!response.ok) {
      return { latest: null, answered, detail: `GitHub answered HTTP ${response.status}` };
    }
    const body = (await response.json()) as {
      tag_name?: unknown;
      draft?: unknown;
      prerelease?: unknown;
    } | null;
    if (!body) return { latest: null, answered, detail: "GitHub answered an empty body" };
    if (body.draft === true || body.prerelease === true) {
      return { latest: null, answered, detail: `release ${String(body.tag_name)} is not final` };
    }
    const latest = releaseBuildFromTag(body.tag_name);
    return latest
      ? { latest, answered, detail: `latest release is ${latest.versionName}` }
      : {
          latest: null,
          answered,
          detail: `tag ${JSON.stringify(body.tag_name)} is not a CI release`,
        };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      latest: null,
      answered,
      detail: answered ? `unreadable release body (${reason})` : `no answer (${reason})`,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * One line saying which build the check will compare, or why it will not run.
 * For the development log: this is what tells someone testing the override in
 * Expo Go whether `EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE` reached the app.
 */
export function describeInstalledBuild(
  input: InstalledBuildInput,
  build: AppBuild | null,
): string {
  if (build) {
    const how = input.forcedVersionCode !== null ? "forced by override" : "release build";
    return `installed ${build.versionName} (versionCode ${build.versionCode}, ${how})`;
  }
  if (input.platform !== "android") return `off: ${input.platform} cannot install an APK`;
  if (input.expoGo || input.dev) {
    return `off: ${input.expoGo ? "Expo Go" : "development build"} and EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE is not set`;
  }
  return `off: ${input.versionName ?? "no version"} / versionCode ${input.versionCode ?? "none"} is not a CI release`;
}

/** Whether enough time has passed since the last read to read again. */
export function shouldCheckForUpdate(lastCheckedAt: number | null, now: number): boolean {
  if (lastCheckedAt === null) return true;
  // A clock set backwards must not silence the check until it catches up.
  if (now < lastCheckedAt) return true;
  return now - lastCheckedAt >= APP_UPDATE_CHECK_INTERVAL_MS;
}

/** The phone's calendar day, local time, e.g. "2026-09-24". */
export function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** "Later", as remembered: which release, and on which day. */
export type UpdateDismissal = { versionCode: number; day: string };

/**
 * Whether to offer `latest` to a phone running `installed`.
 *
 * "Later" quiets that one release for the rest of the day it was tapped. A
 * newer release than the one put off is offered straight away, and on the next
 * day the app is opened the one put off is offered again.
 */
export function shouldOfferUpdate(input: {
  installed: AppBuild;
  latest: AppBuild;
  dismissed: UpdateDismissal | null;
  today: string;
}): boolean {
  if (input.latest.versionCode <= input.installed.versionCode) return false;
  const { dismissed } = input;
  if (
    dismissed &&
    dismissed.day === input.today &&
    dismissed.versionCode >= input.latest.versionCode
  ) {
    return false;
  }
  return true;
}

/** One line for the development log: what `shouldOfferUpdate` decided, and why. */
export function describeOffer(
  input: Parameters<typeof shouldOfferUpdate>[0],
  offered: boolean,
): string {
  const { installed, latest, dismissed } = input;
  if (offered) return `offering ${latest.versionName} over ${installed.versionName}`;
  if (latest.versionCode <= installed.versionCode) {
    return `not offering: ${installed.versionName} is already the latest`;
  }
  return `not offering ${latest.versionName}: "Later" was tapped for ${dismissed?.versionCode ?? "it"} on ${dismissed?.day ?? "today"}`;
}

/**
 * Whether this launch is the first of a newer build than the phone last ran.
 *
 * `lastSeenVersionCode` is `null` on a fresh install, which is not an update:
 * someone who has just installed GRIDGO has nothing to be told.
 */
export function justUpdated(
  installed: AppBuild,
  lastSeenVersionCode: number | null,
): boolean {
  return lastSeenVersionCode !== null && installed.versionCode > lastSeenVersionCode;
}

/** What the phone remembers about updates between launches. */
export type UpdateMemory = {
  /** When GitHub last answered a release read (any status), epoch ms. */
  lastCheckedAt: number | null;
  dismissed: UpdateDismissal | null;
  /** The `versionCode` this phone last ran; `null` until the first launch. */
  lastSeenVersionCode: number | null;
};

export const APP_UPDATE_STORAGE_KEY = "gridgo.appUpdate";

export const EMPTY_UPDATE_MEMORY: UpdateMemory = {
  lastCheckedAt: null,
  dismissed: null,
  lastSeenVersionCode: null,
};

/**
 * Read the stored record back. Anything malformed reads as empty, field by
 * field, so a half-written record costs at most one extra release read.
 */
export function parseUpdateMemory(raw: string | null | undefined): UpdateMemory {
  if (!raw) return EMPTY_UPDATE_MEMORY;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return EMPTY_UPDATE_MEMORY;
  }
  if (!value || typeof value !== "object") return EMPTY_UPDATE_MEMORY;
  const record = value as Record<string, unknown>;

  const lastCheckedAt =
    typeof record.lastCheckedAt === "number" && Number.isFinite(record.lastCheckedAt)
      ? record.lastCheckedAt
      : null;

  const rawDismissed = record.dismissed as Record<string, unknown> | null | undefined;
  const dismissedCode = wholeNumber(rawDismissed?.versionCode);
  const dismissed =
    dismissedCode !== null && typeof rawDismissed?.day === "string"
      ? { versionCode: dismissedCode, day: rawDismissed.day }
      : null;

  return {
    lastCheckedAt,
    dismissed,
    lastSeenVersionCode: wholeNumber(record.lastSeenVersionCode),
  };
}

export const APP_UPDATE_COPY = {
  availableTitle: "A new version of GRIDGO is ready",
  availableBody:
    "Android will ask you to install it over this one. You stay signed in, and any job you have stays with you.",
  installedLabel: "On this phone",
  latestLabel: "Ready to install",
  update: "Update now",
  later: "Later",
  openFailedTitle: "The download did not open",
  openFailedBody: `Open ${APP_UPDATE_SOURCE.downloadPage} in your browser to get the new version.`,
  completedTitle: "Update completed",
  completedBody: (versionName: string) => `You're on ${versionName}.`,
  done: "Done",
} as const;
