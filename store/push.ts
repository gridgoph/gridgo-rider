import { Platform } from "react-native";
import { create } from "zustand";

import * as api from "@/lib/api";
import { liveGeneration } from "@/lib/live";
import { loadExpoNotifications } from "@/lib/expoNotifications";
import {
  devicePlatform,
  PUSH_CHANNEL,
  PUSH_CHANNEL_ID,
  readPushPermission,
  type PushPermission,
} from "@/lib/push";

const Notifications = loadExpoNotifications();

/**
 * The one place `expo-notifications` is spoken to.
 *
 * Every rule this store applies lives in `lib/push.ts` and is unit-tested
 * without a native runtime; what is here is the plumbing that cannot be — the
 * channel, the permission dialog, the FCM token, and keeping the server's idea
 * of this phone in step with the phone's.
 *
 * Ported from `gridgo-supplier` unchanged apart from the error mapper, which is
 * this app's (`apiErrorMessage`). Nothing in this file names a rider concept:
 * the app-specific parts of push are the routes in `pushTargetRoute` and where
 * the enable card is drawn.
 *
 * Three things that look like bugs and are not:
 *
 * - Registration happens only once permission is **granted**. A token from a
 *   phone that will not display a notification is a registration the server
 *   would send to and nothing would come of, and it would make sign-out's
 *   unregister asymmetric.
 * - Registration does **not** wait for a session. A rider that installs GRIDGO
 *   and never signs in is still a phone that has to hear "there is a new
 *   version, update your app", so a granted phone registers at launch with no
 *   bearer and the registration is *unclaimed*; signing in claims it. See
 *   `api.registerDeviceUnclaimed` — that route is provisional, so a deployment
 *   without it is a third outcome and not a failure anyone is shown.
 * - Every native call is wrapped. `getDevicePushTokenAsync` **throws** in Expo
 *   Go on Android — Expo removed remote push from Expo Go in SDK 53 — and this
 *   store is constructed at launch there too. A throw must cost push, never the
 *   app.
 */

/**
 * Where push can work at all.
 *
 * Web is deliberately out: the contract accepts a `web` platform, but browser
 * push needs a service worker and a VAPID key that this MVP does not ship, and
 * an enable card that leads nowhere is worse than no card. `lib/push.ts` keeps
 * the `web` value so a later build can turn this on without touching the
 * contract.
 */
export function pushSupported(os: string = Platform.OS): boolean {
  return os === "android" || os === "ios";
}

type PushState = {
  supported: boolean;
  permission: PushPermission;
  /** The FCM registration token this installation currently holds. */
  token: string | null;
  /**
   * Whether the last registration named the signed-in rider.
   *
   * False after an unclaimed launch registration, and again after sign-out. It
   * is what makes signing in re-register rather than trust a token that is on
   * the server under nobody's name.
   */
  claimed: boolean;
  /** A permission ask or a registration call is in flight. */
  busy: boolean;
  error: string | null;
  /** Read the OS's answer without asking for anything. */
  syncPermission: () => Promise<PushPermission>;
  /** Raise the system dialog, then register. Only ever called from a tap. */
  enable: () => Promise<boolean>;
  /** Launch, sign-in and token rotation all land here. No dialog is raised. */
  registerIfGranted: () => Promise<void>;
  /** Firebase reissued the token while the app was running. */
  adoptToken: (token: string) => Promise<void>;
  /**
   * Sign-out has already unregistered the token with the sign-out call. Forget
   * the claim, then put this phone back on the unclaimed list so GRIDGO can
   * still announce a new version to it.
   */
  release: () => Promise<void>;
};

/**
 * A deployment that has not opened unauthenticated registration yet.
 *
 * `401`/`403` is the answer today — `POST /devices` requires a bearer — and
 * `404`/`405` would be the answer if the route moves. None of them is something
 * a rider did, or can do anything about, so none reaches a screen: the phone
 * simply registers for real the moment somebody signs in.
 */
function isUnclaimedRouteAbsent(error: unknown): boolean {
  return (
    error instanceof api.ApiError &&
    (error.status === 401 || error.status === 403 || error.status === 404 || error.status === 405)
  );
}

/**
 * Create the channel the server's messages name.
 *
 * Android 8+ downgrades or drops a message whose `channel_id` it does not know,
 * and Android 13's permission dialog does not appear until at least one channel
 * exists — so this runs before the first permission read, not before the first
 * notification.
 */
async function ensureChannel(): Promise<void> {
  if (!Notifications || Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: PUSH_CHANNEL.name,
    description: PUSH_CHANNEL.description,
    // These are expiring job offers and a rider waiting at a counter: worth a
    // sound and a heads-up banner, which is also what the server's
    // `priority: high` asks for.
    importance: Notifications.AndroidImportance.HIGH,
  });
}

/** The raw FCM token for this installation, or null if it cannot be had. */
async function fetchToken(): Promise<string | null> {
  if (!Notifications) return null;
  const { data } = await Notifications.getDevicePushTokenAsync();
  return typeof data === "string" && data ? data : null;
}

let registrationQueue: Promise<void> = Promise.resolve();
const registrations = new Set<AbortController>();
export const DEVICE_REGISTRATION_TIMEOUT_MS = 5_000;

export function cancelDeviceRegistrations(): void {
  for (const controller of registrations) controller.abort();
}

/** Claims and authenticated release must reach the server in this order. */
export function serializeDeviceMutation(action: () => Promise<void>): Promise<void> {
  registrationQueue = registrationQueue.catch(() => {}).then(action);
  return registrationQueue;
}

export const usePush = create<PushState>((set, get) => ({
  supported: pushSupported(),
  permission: "unknown",
  token: null,
  claimed: false,
  busy: false,
  error: null,

  syncPermission: async () => {
    if (!Notifications || !get().supported) return "unknown";
    try {
      await ensureChannel();
      const permission = readPushPermission(await Notifications.getPermissionsAsync());
      set({ permission });
      return permission;
    } catch {
      // Expo Go on Android, or a build with no Firebase config. Push is simply
      // unavailable; the Alerts list is unaffected and no card is drawn.
      set({ permission: "unknown" });
      return "unknown";
    }
  },

  enable: async () => {
    if (!Notifications || !get().supported || get().busy) return false;
    set({ busy: true, error: null });
    try {
      await ensureChannel();
      // The dialog. Android 13+ shows it once and a refusal is effectively
      // permanent, which is why nothing calls this except an explicit tap on a
      // card that has already said what will arrive.
      const permission = readPushPermission(await Notifications.requestPermissionsAsync());
      set({ permission });
      if (permission !== "granted") {
        set({ busy: false });
        return false;
      }
    } catch (e) {
      set({ busy: false, error: errorText(e) });
      return false;
    }
    set({ busy: false });
    await get().registerIfGranted();
    return get().permission === "granted";
  },

  registerIfGranted: () => {
    const controller = new AbortController();
    const generation = liveGeneration();
    const isCurrent = () => !controller.signal.aborted && generation === liveGeneration();
    registrations.add(controller);
    const run = async () => {
      if (!isCurrent()) return;
      const state = get();
      if (!Notifications || !state.supported) return;
      const platform = devicePlatform();
      if (!platform) return;
      const permission = state.permission === "unknown" ? await get().syncPermission() : state.permission;
      if (!isCurrent() || permission !== "granted") return;
      const signedIn = await api.sessionBearerPresent();
      if (!isCurrent()) return;
      set({ busy: true, error: null });
      try {
        const token = await fetchToken();
        if (!isCurrent()) return;
        if (!token) {
          set({ busy: false, error: "This phone did not return a notification token." });
          return;
        }
        if (signedIn) set({ token });
        if (signedIn) await api.registerDevice(token, platform, controller.signal);
        else await api.registerDeviceUnclaimed(token, platform, controller.signal);
        if (isCurrent()) set({ token, claimed: signedIn, busy: false, error: null });
      } catch (e) {
        if (!isCurrent()) return;
        set({ busy: false, error: !signedIn && isUnclaimedRouteAbsent(e) ? null : errorText(e) });
      }
    };
    return serializeDeviceMutation(async () => {
      if (!isCurrent()) {
        registrations.delete(controller);
        return;
      }
      let finish: () => void = () => {};
      const cancelled = new Promise<void>((resolve) => { finish = resolve; });
      controller.signal.addEventListener("abort", finish, { once: true });
      const timer = setTimeout(() => controller.abort(), DEVICE_REGISTRATION_TIMEOUT_MS);
      try {
        await Promise.race([run(), cancelled]);
      } finally {
        clearTimeout(timer);
        controller.signal.removeEventListener("abort", finish);
        registrations.delete(controller);
        if (generation === liveGeneration()) set({ busy: false });
      }
    });
  },

  adoptToken: async (token) => {
    if (token === get().token) return;
    set({ token });
    await get().registerIfGranted();
  },

  release: async () => {
    set({ token: null, claimed: false, busy: false, error: null });
    // The bearer is already gone, so this re-registers the phone unclaimed —
    // it stops receiving the previous rider's job offers and stays reachable
    // for an announcement. Silent either way; nobody signing out is waiting
    // on it.
    await get().registerIfGranted();
  },
}));

/**
 * Never a raw error code.
 *
 * `device_token_too_long` tells a rider nothing, and this text can reach the
 * card. Codes go through the same mapping every other screen uses.
 */
function errorText(e: unknown): string {
  return api.apiErrorMessage(
    e,
    "Could not turn on alerts for this phone. Your alerts still arrive in the app.",
  );
}
