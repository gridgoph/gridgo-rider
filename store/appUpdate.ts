import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import {
  APP_UPDATE_STORAGE_KEY,
  EMPTY_UPDATE_MEMORY,
  fetchLatestRelease,
  justUpdated,
  localDay,
  parseUpdateMemory,
  shouldCheckForUpdate,
  shouldOfferUpdate,
  type AppBuild,
  type UpdateMemory,
} from "@/lib/appUpdate";

/**
 * What the update prompt has found, and what the phone remembers about it.
 *
 * The rules are `lib/appUpdate.ts`; this is where they meet storage, the
 * network and the sheet. `hooks/useAppUpdateCheck.ts` decides *when* to call
 * in here, and `app/app-update.tsx` is the sheet.
 *
 * Two findings can wait for the sheet, and "completed" goes first: after an
 * upgrade the phone is on the newest build, so it is rarely followed by an
 * offer at all.
 */

export type UpdateSheet =
  | { kind: "completed"; installed: AppBuild }
  | { kind: "available"; installed: AppBuild; latest: AppBuild };

/** How a sheet was left. Anything but "update" on an offer counts as "Later". */
export type UpdateOutcome = "update" | "later" | "done";

type AppUpdateState = {
  memory: UpdateMemory;
  /** The first launch of a newer build, not yet acknowledged. */
  completed: AppBuild | null;
  /** A newer release to offer. */
  offer: { installed: AppBuild; latest: AppBuild } | null;
  /** The sheet on screen, or `null`. Set before the route is pushed. */
  open: UpdateSheet | null;
};

export const useAppUpdate = create<AppUpdateState>(() => ({
  memory: EMPTY_UPDATE_MEMORY,
  completed: null,
  offer: null,
  open: null,
}));

let hydration: Promise<void> | null = null;
let checking = false;
let writeQueue: Promise<void> = Promise.resolve();

function hydrate(): Promise<void> {
  hydration ??= AsyncStorage.getItem(APP_UPDATE_STORAGE_KEY)
    .then((raw) => useAppUpdate.setState({ memory: parseUpdateMemory(raw) }))
    .catch(() => {
      // Storage that will not answer costs the memory, never the launch.
    });
  return hydration;
}

function remember(patch: Partial<UpdateMemory>): void {
  const memory = { ...useAppUpdate.getState().memory, ...patch };
  useAppUpdate.setState({ memory });
  const payload = JSON.stringify(memory);
  writeQueue = writeQueue.then(() =>
    AsyncStorage.setItem(APP_UPDATE_STORAGE_KEY, payload).catch(() => {}),
  );
}

/**
 * Launch: note whether this is the first run of a newer build, then read the
 * latest release. A cold launch always reads; the throttle is for foregrounds.
 */
export async function startAppUpdate(
  installed: AppBuild,
  deps: { now?: number; fetchImpl?: typeof fetch } = {},
): Promise<void> {
  await hydrate();
  const { lastSeenVersionCode } = useAppUpdate.getState().memory;

  if (justUpdated(installed, lastSeenVersionCode)) {
    // Remembered only once acknowledged, so a launch that dies before the
    // sheet appears still says it next time.
    useAppUpdate.setState({ completed: installed });
  } else if (lastSeenVersionCode !== installed.versionCode) {
    // A fresh install, or a downgrade: nothing to say, but start counting here.
    remember({ lastSeenVersionCode: installed.versionCode });
  }

  await checkForAppUpdate(installed, { ...deps, force: true });
}

/**
 * Read the latest release if the throttle allows, and queue an offer when it
 * is newer and not put off for today. Silent on every failure.
 */
export async function checkForAppUpdate(
  installed: AppBuild,
  {
    now = Date.now(),
    fetchImpl = fetch,
    force = false,
  }: { now?: number; fetchImpl?: typeof fetch; force?: boolean } = {},
): Promise<void> {
  await hydrate();
  if (checking) return;
  if (!force && !shouldCheckForUpdate(useAppUpdate.getState().memory.lastCheckedAt, now)) {
    return;
  }

  checking = true;
  try {
    const latest = await fetchLatestRelease(fetchImpl);
    // Only a read that answered starts the throttle: offline tries again on
    // the next foreground rather than four hours later.
    if (!latest) return;
    remember({ lastCheckedAt: now });

    const offer = shouldOfferUpdate({
      installed,
      latest,
      dismissed: useAppUpdate.getState().memory.dismissed,
      today: localDay(new Date(now)),
    });
    useAppUpdate.setState({ offer: offer ? { installed, latest } : null });
  } finally {
    checking = false;
  }
}

/** The finding the sheet should show next, if any. */
export function nextUpdateSheet(state: AppUpdateState): UpdateSheet | null {
  if (state.completed) return { kind: "completed", installed: state.completed };
  if (state.offer) return { kind: "available", ...state.offer };
  return null;
}

/** Claim the next finding for the sheet. `null` when there is nothing to show. */
export function openUpdateSheet(): UpdateSheet | null {
  const state = useAppUpdate.getState();
  if (state.open) return null;
  const sheet = nextUpdateSheet(state);
  if (sheet) useAppUpdate.setState({ open: sheet });
  return sheet;
}

/**
 * Close the open sheet and record what it means. Safe to call more than once:
 * the route calls it again on unmount, and a second call changes nothing.
 *
 * `sheet` names the finding the caller showed, so a route unmounting late can
 * never settle the sheet that opened after it.
 */
export function settleUpdateSheet(
  outcome: UpdateOutcome,
  { sheet, now = Date.now() }: { sheet?: UpdateSheet; now?: number } = {},
): void {
  const { open } = useAppUpdate.getState();
  if (!open || (sheet && sheet !== open)) return;

  if (open.kind === "completed") {
    remember({ lastSeenVersionCode: open.installed.versionCode });
    useAppUpdate.setState({ completed: null, open: null });
    return;
  }

  if (outcome !== "update") {
    remember({
      dismissed: { versionCode: open.latest.versionCode, day: localDay(new Date(now)) },
    });
  }
  useAppUpdate.setState({ offer: null, open: null });
}

/** Test seam: forget everything held in memory. */
export function resetAppUpdateForTests(): void {
  hydration = null;
  checking = false;
  writeQueue = Promise.resolve();
  useAppUpdate.setState({
    memory: EMPTY_UPDATE_MEMORY,
    completed: null,
    offer: null,
    open: null,
  });
}
