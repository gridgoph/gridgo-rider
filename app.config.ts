import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * app.json stays the whole configuration. This file only stamps the build
 * identity onto it.
 *
 * A sideloaded APK has no store listing, so the version a rider reads in
 * Settings → Apps is the only handle anyone has on "which build is on this
 * phone". Leaving it at the app.json value means every APK ever shipped calls
 * itself 1.0.0, and Android refuses to install one release over another
 * unless `versionCode` has gone up.
 *
 * So the build number owns the patch segment: app.json keeps MAJOR.MINOR as
 * the release line, CI appends its run number (`GRIDGO_BUILD_NUMBER`, set in
 * `.github/workflows/android-release.yml`), and `versionCode` is that same
 * number. With no build number — any local `expo start` — the app.json version
 * stands unchanged and nothing pretends to be a release.
 *
 * The rule lives here rather than in `lib/`: @expo/config evaluates this file
 * with its own TypeScript loader, which does not resolve an extensionless
 * relative `.ts` import, and the `.ts` spelling that does resolve is a `tsc`
 * error (TS5097). `__tests__/appConfigVersion.test.ts` calls these exports
 * directly, so the rule is tested where it runs.
 */

const RELEASE_LINE = /^(\d+)\.(\d+)(?:\.|$)/;

/**
 * Keep Clerk's frontend key explicit at the Expo config boundary. Everything
 * under `extra` is readable from the installed app, so a secret key is never
 * valid input here.
 */
export function clerkPublishableKey(
  value: string | null | undefined,
): string | undefined {
  const key = value?.trim();
  if (!key) return undefined;
  if (!key.startsWith("pk_")) {
    throw new Error("The Clerk publishable key must start with pk_, never a secret key.");
  }
  return key;
}

export type BuildVersion = {
  /** Human-visible version string, e.g. "1.0.42". */
  versionName: string;
  /** Android versionCode — must increase for an install to be an upgrade. */
  versionCode: number;
};

/**
 * @param baseVersion `expo.version` from app.json, e.g. "1.0.0".
 * @param buildNumber CI run number; blank or absent outside CI.
 */
export function buildVersion(
  baseVersion: string,
  buildNumber: string | null | undefined,
): BuildVersion {
  const line = RELEASE_LINE.exec(baseVersion.trim());
  if (!line) {
    throw new Error(
      `app.json expo.version must start with MAJOR.MINOR, got "${baseVersion}"`,
    );
  }

  const build = (buildNumber ?? "").trim();
  if (!build) return { versionName: baseVersion.trim(), versionCode: 1 };

  if (!/^\d+$/.test(build)) {
    throw new Error(`Build number must be a whole number, got "${build}"`);
  }

  const versionCode = Number(build);
  if (versionCode < 1) {
    throw new Error(`Build number must be 1 or greater, got "${build}"`);
  }

  return { versionName: `${line[1]}.${line[2]}.${versionCode}`, versionCode };
}

/**
 * Where this build's `google-services.json` comes from.
 *
 * Push on Android needs the Firebase config for `ph.gridgo.rider` in project
 * `gridgo-c2ce9`. One file covers all three GRIDGO packages and the Expo plugin
 * picks the entry by package name. That file is the captain's and is **never
 * committed** — `.gitignore` keeps it out — so it reaches a build as
 * configuration:
 *
 * - `GOOGLE_SERVICES_JSON` names a path (what CI sets, from a repository
 *   secret written to a file outside the workspace);
 * - otherwise a `google-services.json` dropped in the repo root is used, which
 *   is how a developer's machine and a local release build get it;
 * - otherwise the key is omitted entirely.
 *
 * Omitting is deliberate rather than fatal: `npx expo start`, `npx tsc`, the
 * test suite and `npx expo config --type public` all have to work on a machine
 * that has never seen the file, and they do — the build simply has no Firebase,
 * `getDevicePushTokenAsync` throws, and `store/push.ts` treats push as
 * unavailable and shows no card. What must never happen quietly is a *release*
 * built without it, so `.github/workflows/android-release.yml` asserts the file
 * is present, and is this app's, before it calls prebuild.
 *
 * A path that is named and missing is always an error: it means the wiring is
 * broken, and falling back would ship an APK that silently never receives
 * anything.
 *
 * @param envPath `process.env.GOOGLE_SERVICES_JSON`.
 * @param projectRoot directory the repo-root fallback is resolved against.
 * @param fileExists injected for the test; defaults to a real filesystem check.
 */
export function googleServicesFile(
  envPath: string | null | undefined,
  projectRoot: string,
  fileExists: (path: string) => boolean = existsSync,
): string | undefined {
  const named = (envPath ?? "").trim();
  if (named) {
    const path = resolve(projectRoot, named);
    if (!fileExists(path)) {
      throw new Error(
        `GOOGLE_SERVICES_JSON points at "${named}", which does not exist. ` +
          "A build with a broken Firebase path would install and never receive an alert.",
      );
    }
    return path;
  }

  const local = resolve(projectRoot, "google-services.json");
  return fileExists(local) ? local : undefined;
}

/**
 * Where the iPhone build's `GoogleService-Info.plist` comes from.
 *
 * iPhone push goes through Firebase Cloud Messaging, so the iOS build needs
 * Firebase's config for `ph.gridgo.rider`. Like `google-services.json` it is
 * the captain's and is **never committed**; it reaches a build as
 * configuration:
 *
 * - `GOOGLE_SERVICE_INFO_PLIST` names a path. On EAS Build that is a *file*
 *   environment variable, whose value on the build machine is the path of the
 *   uploaded file;
 * - otherwise a `GoogleService-Info.plist` dropped in the repo root is used;
 * - otherwise the key is omitted, and `plugins/withIosStoreBuild.js` leaves
 *   Firebase out of the build: push on that iPhone is simply unavailable.
 *
 * A named path that is missing is an error **on an EAS build machine**, where
 * a quiet fallback would ship an app that never receives anything. Anywhere
 * else it is ignored: eas-cli also evaluates this file on the machine that
 * starts the build, where a secret file variable is not readable.
 */
export function googleServiceInfoFile(
  envPath: string | null | undefined,
  projectRoot: string,
  onEasBuilder: boolean,
  fileExists: (path: string) => boolean = existsSync,
): string | undefined {
  const named = (envPath ?? "").trim();
  if (named) {
    const path = resolve(projectRoot, named);
    if (fileExists(path)) return path;
    if (onEasBuilder) {
      throw new Error(
        `GOOGLE_SERVICE_INFO_PLIST points at "${named}", which does not exist. ` +
          "An iPhone build without Firebase would install and never receive an alert.",
      );
    }
    return undefined;
  }

  const local = resolve(projectRoot, "GoogleService-Info.plist");
  return fileExists(local) ? local : undefined;
}

/**
 * What an App Store build is missing, by variable name only.
 *
 * The iPhone build runs on EAS Build, so its `EXPO_PUBLIC_*` values come from
 * the EAS project's `production` environment rather than from GitHub secrets.
 * `.github/workflows/android-release.yml` refuses a release APK without them;
 * this is the same refusal for the store build, made on the build machine
 * before anything is compiled. Values are never echoed.
 *
 * Empty for every other build: a development build, a preview build, a local
 * `expo start`, and anything Android.
 */
export function iosStoreBuildProblems(
  env: Record<string, string | undefined>,
): string[] {
  if (env.EAS_BUILD_PLATFORM !== "ios" || env.EAS_BUILD_PROFILE !== "production") {
    return [];
  }
  const problems: string[] = [];
  if (!(env.EXPO_PUBLIC_API_URL ?? "").trim().startsWith("https://")) {
    problems.push("EXPO_PUBLIC_API_URL must be the deployed https:// API");
  }
  if (!(env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "").trim().startsWith("pk_live_")) {
    problems.push("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY must be the live Clerk key (pk_live_*)");
  }
  if (!(env.EXPO_PUBLIC_CARTO_API_KEY ?? "").trim()) {
    problems.push("EXPO_PUBLIC_CARTO_API_KEY is missing");
  }
  if (!(env.GOOGLE_SERVICE_INFO_PLIST ?? "").trim()) {
    problems.push("GOOGLE_SERVICE_INFO_PLIST (the Firebase file for iPhone push) is missing");
  }
  return problems;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const { name, slug, version } = config;
  if (!name || !slug || !version) {
    throw new Error("app.json must define expo.name, expo.slug and expo.version");
  }

  const { versionName, versionCode } = buildVersion(
    version,
    process.env.GRIDGO_BUILD_NUMBER,
  );

  const googleServices = googleServicesFile(process.env.GOOGLE_SERVICES_JSON, __dirname);
  const storeProblems = iosStoreBuildProblems(process.env);
  if (storeProblems.length) {
    throw new Error(
      `The App Store build is missing EAS environment variables (production):\n- ${storeProblems.join("\n- ")}`,
    );
  }
  const googleServiceInfo = googleServiceInfoFile(
    process.env.GOOGLE_SERVICE_INFO_PLIST,
    __dirname,
    process.env.EAS_BUILD === "true",
  );
  const clerkKey = clerkPublishableKey(process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return {
    ...config,
    name,
    slug,
    version: versionName,
    // First on purpose: a mod registered earlier runs later, so the iOS store
    // settings see what expo-audio and the rest have already written.
    plugins: ["./plugins/withIosStoreBuild", ...(config.plugins ?? [])],
    extra: {
      ...config.extra,
      ...(clerkKey ? { clerkPublishableKey: clerkKey } : {}),
    },
    ios: {
      ...config.ios,
      // Spread for the same reason as `googleServicesFile` below.
      ...(googleServiceInfo ? { googleServicesFile: googleServiceInfo } : {}),
    },
    android: {
      ...config.android,
      versionCode,
      // Spread rather than assigned: `googleServicesFile: undefined` is a key
      // the Expo plugin still sees, and it resolves it as a path.
      ...(googleServices ? { googleServicesFile: googleServices } : {}),
    },
  };
};
