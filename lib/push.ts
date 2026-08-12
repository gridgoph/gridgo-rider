/**
 * Push notifications: everything decidable without the native module.
 *
 * `GET /notifications` only reaches a phone while the app is open. Push is the
 * third delivery leg — the server sends the same notification record through
 * FCM HTTP v1 to every device the owner has registered, so it arrives with the
 * app closed and the screen locked. See `docs/OPERATIONAL_MODEL_V2_API.md` §
 * "Push notifications" in **gridgo-api** for the contract; it is authoritative
 * and this file must not drift from it.
 *
 * Ported from `gridgo-supplier`, which already has unclaimed register (a rider
 * who installs and never signs in still has to hear "update your app").
 * Everything here is that app's except `pushTargetRoute`, which names this
 * app's routes, and the copy, which names a rider's work.
 *
 * Nothing here imports `expo-notifications`, so every rule below is unit-tested
 * without a native runtime. `store/push.ts` is the thin layer that does talk to
 * the module.
 *
 * ## What a rider is interrupted for
 *
 * The server decides what it sends; this app cannot filter arrivals. But the
 * card's copy promises a list, and the list a rider was promised is the one
 * this app was built around. A rider opens GRIDGO to take work and close the
 * trip in hand, so an event earns an interruption only when ignoring it costs
 * one of those:
 *
 * - **A job offered to them.** Offers sit in a shared pool; a missed one is
 *   work another rider took.
 * - **Operations answering a failed pickup check.** The rider is standing at
 *   the counter and cannot transport until they re-run the six checks.
 * - **The account being approved.** An unapproved rider is signed in and
 *   cannot take any work at all — that wait is the whole screen until the
 *   decision lands.
 *
 * Deliberately **not** on that list: ordinary trip movements the rider will
 * see the next time they open Active (they took the step themselves). A phone
 * that buzzes for those teaches a rider to ignore the phone.
 */

import { Platform } from "react-native";

/**
 * The Android channel the server names in every message.
 *
 * `android.notification.channel_id` is `gridgo_default` on the server side, and
 * **a message naming a channel the app has not created is downgraded or dropped
 * on Android 8+**. The channel must therefore exist before a token is ever
 * requested — which is also what makes the Android 13 permission dialog
 * appear at all, since it does not show until a channel exists.
 *
 * Keep this identifier identical in all three apps: it is the server's string,
 * not each app's.
 */
export const PUSH_CHANNEL_ID = "gridgo_default";

/** Channel presentation. Importance is high — these are SLA-bearing updates. */
export const PUSH_CHANNEL = {
  name: "Job and trip alerts",
  description:
    "Jobs offered to you, Operations answering a failed pickup check, and when your account is approved.",
} as const;

/** The `platform` value `POST /devices` accepts. */
export type DevicePlatform = "android" | "ios" | "web";

/**
 * Map the runtime to the contract's platform value.
 *
 * The contract allows exactly `android`, `ios` and `web`; anything else is
 * `400 invalid_device_platform`. React Native reports `windows`/`macos` on
 * platforms this app does not ship to, so those are refused here rather than
 * being sent for the server to reject.
 */
export function devicePlatform(os: string = Platform.OS): DevicePlatform | null {
  if (os === "android" || os === "ios" || os === "web") return os;
  return null;
}

/**
 * The `data` map of an FCM message, as this app may read it.
 *
 * The keys are exactly `notificationId`, `type`, `orderId` and `at`, all
 * strings, and a key with no value is simply absent — a notification with no
 * job carries no `orderId`. The map is an allowlist on the server, so **no
 * money reaches a lock screen**: the client's price and GRIDGO's commission
 * cannot appear here even if a future notification record carries them. The
 * only figure this app ever renders is the rider's own delivery fee, and it
 * is not in this payload. Nothing else in the payload is contractual, so
 * nothing else is read.
 */
export type PushData = {
  notificationId: string | null;
  type: string | null;
  orderId: string | null;
  at: string | null;
};

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  // Contractually always a string. A number would still be meaningful, and a
  // payload that has drifted must not crash a lock-screen tap.
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

/** Read an FCM `data` map defensively. Never throws — a tap must always land. */
export function parsePushData(raw: unknown): PushData {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    notificationId: readString(source, "notificationId"),
    type: readString(source, "type"),
    orderId: readString(source, "orderId"),
    at: readString(source, "at"),
  };
}

/**
 * Types that mean "there is a job in the pool you can take".
 *
 * A shop has one job workspace where Accept lives. A rider does not: Accept
 * is on Offers, and the trip in hand is on Active. Routing an offer tap at
 * Active would land them on an empty trip (or a different one) and hide the
 * Accept. The set is explicit so an unknown `type` never invents a screen —
 * the contract's instruction for those is the alerts list, except when an
 * `orderId` is present, in which case Active is the job.
 */
export const DISPATCH_OFFER_TYPES = new Set([
  "dispatch_available",
  "rider_job_offered",
  "job_offered",
]);

/**
 * Where a tapped notification opens. **App-specific** — the client and
 * supplier apps map the same payload onto their own routes.
 *
 * "Tapping a notification opens the right screen, not just the app":
 *
 * - An **announcement**, or any alert with no job, opens **Alerts** — the
 *   contract's instruction for `type: "announcement"` and for an unknown
 *   type. Alerts is a pushed route here, not a tab.
 * - A **dispatch offer** opens **Offers**, which is where Accept lives.
 * - Any other alert that names a job opens **Active**, which is the trip
 *   in hand (pickup checks, sign-off, delivery). The push carries no order
 *   state, so Active fetches the trip as it always does.
 */
export function pushTargetRoute(data: PushData): string {
  if (data.type === "announcement" || !data.orderId) return "/alerts";
  if (data.type && DISPATCH_OFFER_TYPES.has(data.type)) return "/(tabs)/offers";
  return "/(tabs)/active";
}

/**
 * Permission as this app reasons about it.
 *
 * Android 13+ requires an explicit runtime prompt and a refusal is effectively
 * permanent — the OS stops offering the dialog, so `blocked` is a genuinely
 * different state from `undetermined` and needs different words and a different
 * button. `unknown` is before the first read, including web and Expo Go where
 * there is nothing to read.
 */
export type PushPermission = "unknown" | "undetermined" | "granted" | "blocked";

/**
 * Fold the module's permission response into that.
 *
 * `granted` is the only positive: iOS `provisional` and Android's implicit
 * pre-13 grant both arrive as granted. Denied-but-askable stays `undetermined`
 * because the dialog can still be shown; denied-and-not-askable is `blocked`
 * and only the system settings screen can change it.
 */
export function readPushPermission(response: {
  granted?: boolean;
  status?: string;
  canAskAgain?: boolean;
}): PushPermission {
  if (response.granted || response.status === "granted") return "granted";
  if (response.status === "undetermined") return "undetermined";
  return response.canAskAgain === false ? "blocked" : "undetermined";
}

/** What the enable card should do, if anything. */
export type PushOffer = "hidden" | "ask" | "settings" | "retry";

/**
 * Whether to offer phone notifications, and how.
 *
 * The ask is never fired cold: this returns `ask` only so a **card** can be
 * drawn, and the OS dialog is raised from that card's button. A refusal on
 * Android 13+ cannot be taken back by the app, so once blocked the only honest
 * offer is a link to the phone's own settings — and it is still only an offer.
 * Granted or unsupported: nothing is shown, because there is nothing to gain by
 * showing it.
 *
 * `retry` is the exception to that silence. A phone that granted permission and
 * then failed to register is the worst state of the lot: it looks exactly like
 * a working one, and simply never rings. Nothing else in the app would ever say
 * so, so the card stays on screen and says it.
 *
 * **Signed out is an offer, not a silence** — this is the supplier rule, kept
 * on purpose. A rider that installs GRIDGO and does not sign in for a week
 * still has to hear "there is a new version, update your app", and on
 * Android 13+ that is impossible unless the permission has been asked for by
 * then. So the door may ask. It may ask *only*: a signed-out phone is never
 * told it is blocked or that a registration failed, because neither is
 * something a person standing at a sign-in screen can act on, and neither is
 * about them yet.
 */
export function pushOffer(input: {
  supported: boolean;
  signedIn: boolean;
  permission: PushPermission;
  /** A permission ask or a registration call failed. */
  failed?: boolean;
}): PushOffer {
  if (!input.supported) return "hidden";
  if (!input.signedIn) return input.permission === "undetermined" ? "ask" : "hidden";
  if (input.failed) return input.permission === "blocked" ? "settings" : "retry";
  if (input.permission === "granted" || input.permission === "unknown") return "hidden";
  return input.permission === "blocked" ? "settings" : "ask";
}

/**
 * One line saying what will arrive, plus the verb on the button.
 *
 * A person deciding on a prompt they can only answer once deserves to know it
 * is their own work and not marketing. **App-specific**: this names a rider's
 * work, not a print shop's.
 */
export function pushOfferCopy(
  offer: Exclude<PushOffer, "hidden">,
  signedIn: boolean = true,
): {
  title: string;
  body: string;
  action: string;
} {
  if (offer === "ask" && !signedIn) {
    // The door. Promising job offers here would be a lie — GRIDGO has no idea
    // whose phone this is yet — so it promises only what an unclaimed phone
    // actually gets, and says the rest follows sign-in.
    return {
      title: "Get GRIDGO news on this phone",
      body: "Turn this on now and GRIDGO can tell this phone when there is a new version to install. Once you sign in, your job offers and trip news come the same way.",
      action: "Turn on alerts",
    };
  }
  if (offer === "retry") {
    return {
      title: "This phone is not registered for alerts",
      body: "Permission is on, but we could not register this phone, so nothing will reach it while GRIDGO is closed. Your alerts still arrive in the app.",
      action: "Try again",
    };
  }
  if (offer === "settings") {
    return {
      title: "Alerts are off for GRIDGO",
      body: "Your phone is blocking them, so new jobs and trip news only appear while the app is open. Turn them on in your phone's settings.",
      action: "Open phone settings",
    };
  }
  return {
    title: "Get these on your phone",
    body: "We will notify this phone when a job is offered to you, when Operations answers a failed pickup check, and when your account is approved — even with GRIDGO closed.",
    action: "Turn on alerts",
  };
}

/**
 * What a push should do when it lands while the app is open and in front of
 * the person.
 *
 * Nothing visible. The Alerts list and its unread badge already carry every
 * notification — a push is the *same record*, so a banner over it is the same
 * news twice. The foreground handler therefore suppresses the banner, the tray
 * entry, the sound and the badge, and the arrival is spent making the unread
 * count agree with the platform instead. Backgrounded or closed, this handler
 * never runs and Android draws the server's own title and body.
 */
export const PUSH_FOREGROUND_BEHAVIOR = {
  shouldShowBanner: false,
  shouldShowList: false,
  shouldPlaySound: false,
  shouldSetBadge: false,
} as const;
