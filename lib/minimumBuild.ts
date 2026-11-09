import { installedBuild, type AppBuild, type InstalledBuildInput } from "./appUpdate";

/**
 * The oldest rider build GRIDGO still lets carry a job, and what this phone
 * does when it is older (handover dead end on ord_de22bfb54b9d, 16 Oct 2026:
 * the API ran the `rider_packs` counter, the phone ran a build from before it,
 * and the update prompt could be put off).
 *
 * Three ways a build learns it is too old, all ending on the same screen:
 *
 *  1. **The published minimum.** gridgo-api serves each app's minimum build
 *     publicly; this build reads it at launch and on every return to the
 *     foreground. A missing route, an error or a body it cannot read is "no
 *     minimum": the check can only ever block on a clear answer.
 *  2. **A `426 app_update_required`** from any request. The API answers it on
 *     `rider_packs` custody routes when `X-GRIDGO-App` names a build below the
 *     minimum.
 *  3. **A handover flow this build does not know.** A newer counter on the
 *     order is a step this build cannot run, so it is an update, never a dead
 *     end.
 *
 * Mid-trip the block never takes the screen: the job, its location sharing
 * and anything typed stay as they are, and only the custody step that needs
 * the newer flow is closed (`custodyStepNeedsUpdate`). With no job in hand it
 * covers the whole app (`updateBlock`).
 *
 * Pure, so every rule is tested without a phone.
 */

/** This app's name in `X-GRIDGO-App` and in the minimum-build answer. */
export const RIDER_APP = "rider";

/**
 * Where gridgo-api publishes each app's minimum build for the `rider_packs`
 * flow. Public: an old build has to learn it is old before anyone can sign in
 * to it.
 */
export const MINIMUM_BUILD_PATH = "/app-minimum-builds";

/** A minimum read that has not answered by now is "no minimum". */
export const MINIMUM_BUILD_FETCH_TIMEOUT_MS = 8_000;

/** The handover flows this build can run. `null`/absent is an older API: legacy. */
const KNOWN_HANDOVER_FLOWS: readonly string[] = ["rider_packs", "legacy"];

/**
 * `X-GRIDGO-App` for this build: `rider/<version>+<versionCode>`, e.g.
 * `rider/1.0.161+161`. `null` sends no header, which the API treats exactly as
 * it did before the header existed.
 */
export function appHeaderValue(build: AppBuild | null): string | null {
  return build ? `${RIDER_APP}/${build.versionName}+${build.versionCode}` : null;
}

/**
 * The build this phone names to GRIDGO, or `null` to name none.
 *
 * Only an Android CI release has a `versionCode` on the same scale as the
 * published minimum (the release run number, `app.config.ts`). A development
 * build or Expo Go reports versionCode 1 and would be refused every
 * `rider_packs` step, so it sends nothing. An iPhone's build number is EAS's
 * own counter, unrelated to that scale, so an iPhone sends nothing either
 * until the API keeps a minimum per platform.
 *
 * `EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE` (development only, inlined at
 * bundle time) pretends to be that build on any platform, so the block can be
 * seen without a release APK.
 */
export function riderBuild(input: InstalledBuildInput): AppBuild | null {
  if (input.forcedVersionCode !== null) return installedBuild({ ...input, platform: "android" });
  return installedBuild(input);
}

function wholeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : null;
}

/**
 * The rider minimum in the API's answer,
 * `{ version, minimumBuilds: { client, supplier, rider } }`, or `null` for "no
 * minimum". A minimum of 0 (the API's "none") and anything unreadable are
 * both no minimum.
 */
export function parseRiderMinimum(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const builds = (body as { minimumBuilds?: unknown }).minimumBuilds;
  if (!builds || typeof builds !== "object") return null;
  return wholeNumber((builds as Record<string, unknown>)[RIDER_APP]);
}

/**
 * Read the rider minimum. Never throws, never blocks on a failure: offline,
 * a timeout, a 404 from an API without the route, any other status and an
 * unreadable body all answer `null`.
 */
export async function fetchRiderMinimum(
  fetchImpl: typeof fetch,
  apiBase: string,
  { timeoutMs = MINIMUM_BUILD_FETCH_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<number | null> {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(`${apiBase.replace(/\/$/, "")}${MINIMUM_BUILD_PATH}`, {
      headers: { Accept: "application/json" },
      signal: controller?.signal,
    });
    if (!response.ok) return null;
    return parseRiderMinimum(await response.json());
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Whether `installed` is older than `minimum`. Unknown either way is not. */
export function isBelowMinimum(installed: AppBuild | null, minimum: number | null): boolean {
  return Boolean(installed) && minimum !== null && installed!.versionCode < minimum;
}

/** Whether a refusal is the API's `426 app_update_required`. */
export function isUpdateRequiredRefusal(status: number, body: unknown): boolean {
  if (status !== 426) return false;
  return Boolean(
    body && typeof body === "object" && (body as { error?: unknown }).error === "app_update_required",
  );
}

/** Whether this build can run the order's handover flow. */
export function knowsHandoverFlow(flow: unknown): boolean {
  return flow === null || flow === undefined || (typeof flow === "string" && KNOWN_HANDOVER_FLOWS.includes(flow));
}

/**
 * Whether a custody screen (pickup, pack, handoff, delivery) must show the
 * update instead of its step.
 *
 * A flow this build does not know always needs the update. Otherwise only a
 * `rider_packs` job needs it, and only once this build is known to be too
 * old: a legacy job carries on exactly as before, because the old build can
 * run it and the API never refuses it.
 */
export function custodyStepNeedsUpdate(
  order: { handoverFlow?: unknown } | null,
  updateRequired: boolean,
): boolean {
  if (!order) return false;
  if (!knowsHandoverFlow(order.handoverFlow)) return true;
  return updateRequired && order.handoverFlow === "rider_packs";
}

/**
 * How much of the app the update takes.
 *
 * `full` covers everything: no job is in hand. `steps` leaves the app usable
 * because a job is (or may be — the trip has not loaded yet), and closes only
 * the custody steps `custodyStepNeedsUpdate` names. `null` blocks nothing.
 */
export function updateBlock(input: { updateRequired: boolean; tripInHand: boolean }): "full" | "steps" | null {
  if (!input.updateRequired) return null;
  return input.tripInHand ? "steps" : "full";
}

export const UPDATE_REQUIRED_COPY = {
  title: "Update GRIDGO",
  fullBody: "This version is too old to take jobs.",
  stepBody: "Update to do this step. Your trip stays as it is.",
  action: "Update now",
  opening: "Opening…",
  installed: (versionName: string) => `On this phone: ${versionName}`,
  openFailed: "The update did not open. Try again.",
} as const;
