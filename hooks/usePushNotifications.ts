import * as api from "@/lib/api";
import { invalidate, liveGeneration, subscribeLive } from "@/lib/live";
import { useRouter, useRootNavigationState, type Href } from "expo-router";
import { useEffect, useLayoutEffect, useRef } from "react";
import { AppState } from "react-native";

import { loadExpoNotifications } from "@/lib/expoNotifications";
import { parsePushData, PUSH_FOREGROUND_BEHAVIOR, pushTargetRoute } from "@/lib/push";
import { useNotifications } from "@/store/notifications";
import { usePush } from "@/store/push";
import { isSignedIn, useSession } from "@/store/session";

const Notifications = loadExpoNotifications();

/**
 * Push, wired to the app: registration, token rotation, and opening the right
 * screen when a rider taps an alert.
 *
 * Mounted once, from the root layout. Everything it decides comes from
 * `lib/push.ts`; everything it stores goes through `store/push.ts`.
 * Taps wait for a ready navigator and settled sign-in, then verify the referenced
 * notification or order through the API. Missing inbox rows and revoked access
 * go to Alerts; offline taps stay pending for a live refresh retry. Changing
 * accounts drops taps captured for the previous owner. Approval is not required
 * to open Alerts.
 */

/**
 * Every call into `expo-notifications` from this file, wrapped.
 *
 * The module reaches native eagerly and **throws** where the native module is
 * absent — Expo Go on Android has had no remote push since SDK 53, and a build
 * whose autolinking missed the package behaves identically. Unwrapped, that
 * throw happens at module scope or inside the root layout's effect, which takes
 * down the whole app on a screen nobody can get past: observed on the emulator,
 * as `Cannot find native module 'ExpoPushTokenManager'` followed by
 * `Cannot read property 'ErrorBoundary' of undefined`.
 *
 * `store/push.ts` already wraps its own calls for this reason. This is the
 * other half, and it must stay: push failing is a feature not working, and it
 * must never be an app that will not open.
 */
/** A rejected promise from the module is the same non-event as a throw. */
function noop(): void {}

function withoutNativeModule<T>(call: () => T): T | null {
  try {
    return call();
  } catch {
    return null;
  }
}

/**
 * What a push does while the app is open and in front of the person.
 *
 * Nothing visible — see `PUSH_FOREGROUND_BEHAVIOR`. Set at module scope
 * deliberately: this must be in place before the first notification can arrive,
 * and a handler installed inside an effect races the notification that woke the
 * app. It runs only in the foreground, so a closed or backgrounded app is
 * untouched and Android draws the server's own title and body.
 */
if (Notifications) {
  withoutNativeModule(() =>
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ ...PUSH_FOREGROUND_BEHAVIOR }),
    }),
  );
}

/** Reconcile from the authorized inbox rather than trusting push payload counts. */
async function refreshUnread(): Promise<void> {
  await useNotifications.getState().refreshUnread();
}

export function usePushNotifications(): void {
  const router = useRouter();
  const navigationReady = Boolean(useRootNavigationState()?.key);
  const ready = useRef(navigationReady);
  useLayoutEffect(() => { ready.current = navigationReady; }, [navigationReady]);
  const user = useSession((s) => s.user);
  const signedIn = isSignedIn(user);
  const loading = useSession((s) => s.loading);
  const sessionWait = useSession((s) => s.sessionWait);

  /**
   * A tap that arrived before there was anywhere to send it.
   *
   * An alert tapped from a cold start opens the app on the sign-in screen
   * only when no stored session comes back. Routing to Offers or Active then
   * would bounce off the auth gate, so the target waits here and is spent
   * when a session appears. This app persists the session, so the usual
   * cold-start path already has a user by the time the layout mounts.
   */
  const pending = useRef<{identifier:string; data:unknown; owner:string|null} | null>(null);
  /** Response identifiers already routed, so a tap opens its screen once. */
  const routed = useRef(new Set<string>());

  async function spendPending(): Promise<void> {
    const target = pending.current;
    const session = useSession.getState().user;
    if (!target || !isSignedIn(session) || !ready.current || useSession.getState().loading || useSession.getState().sessionWait) return;
    if (target.owner && target.owner !== session?.id) { pending.current = null; return; }
    const generation = liveGeneration();
    const data = parsePushData(target.data);
    try {
      // A device may carry an old owner's push. Never trust its orderId as access.
      if (data.notificationId) {
        const items = await api.listNotifications();
        const owned = items.find((item) => item.id === data.notificationId);
        // Older notifications may be outside the inbox page. The authorized inbox is a safe fallback.
        data.orderId = owned?.orderId ?? null;
        if (!owned) data.type = null;
      } else if (data.orderId) {
        await api.getOrder(data.orderId);
      }
      if (generation !== liveGeneration() || pending.current !== target || !ready.current) return;
      pending.current = null;
      invalidate("*");
      const destination = pushTargetRoute(data);
      router.push(destination as Href);
      withoutNativeModule(() => Notifications?.clearLastNotificationResponseAsync().catch(noop));
    } catch (error) {
      // Offline taps stay pending until reconnect. Explicit revocation goes to the inbox only.
      if (generation === liveGeneration() && pending.current === target && error instanceof api.ApiError && (error.status === 403 || error.status === 404)) {
        pending.current = null;
        router.push("/alerts");
      }
    }
  }
  const spend = useRef(spendPending);
  useLayoutEffect(() => { spend.current = spendPending; });

  useEffect(() => {
    // Register on **every launch**, signed in or not, and again whenever the
    // account changes. The contract calls this idempotent and cheap and asks
    // apps to do exactly that — a token Firebase has quietly reissued is the
    // common way push stops arriving with nothing visibly wrong.
    //
    // Not gated on a session: a phone with permission granted and nobody
    // signed in registers unclaimed, which is what lets GRIDGO tell a rider
    // that installed the app and stopped there to update it. Signing in
    // re-runs this with a bearer and claims the same token — see
    // `store/push.ts`.
    //
    // Not gated on approval either: a rider waiting on accreditation is
    // exactly the rider whose approval they most want to hear about while
    // the app is closed.
    void usePush.getState().registerIfGranted();
  }, [signedIn, user?.id]);

  useEffect(() => {
    // And on every return to the front. The permission is re-read first:
    // a rider sent to the phone's settings by the card or the explainer comes
    // back here, and a phone that just allowed notifications has to register
    // now rather than on the next cold launch.
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void usePush.getState().resume();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const route = (identifier: string, data: unknown) => {
      if (routed.current.has(identifier)) return;
      routed.current.add(identifier);
      const owner = useSession.getState().user?.id ?? null;
      pending.current = {identifier, data, owner};
      // Defer capture; spending separately requires navigator and session readiness.
      setTimeout(() => { void spend.current(); }, 0);
    };

    if (!Notifications) {
      return () => {};
    }

    // A tap while the app is running or backgrounded.
    const tap = withoutNativeModule(() =>
      Notifications.addNotificationResponseReceivedListener((response) => {
        route(
          response.notification.request.identifier,
          response.notification.request.content.data,
        );
      }),
    );

    // A tap that launched the app. The listener above does not replay it.
    withoutNativeModule(() =>
      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (!response) return;
        route(
          response.notification.request.identifier,
          response.notification.request.content.data,
        );
      }, noop),
    );

    // A push landing in the foreground shows nothing (see the handler above);
    // it invalidates live resources and reconciles the unread badge.
    const received = withoutNativeModule(() =>
      Notifications.addNotificationReceivedListener(() => {
        invalidate("*");
        void refreshUnread();
      }),
    );

    // Firebase can reissue a token while the app is running. A stale one stops
    // delivering silently, which is the failure nobody reports.
    const rotated = withoutNativeModule(() =>
      Notifications.addPushTokenListener((token) => {
        if (typeof token.data === "string" && token.data) {
          void usePush.getState().adoptToken(token.data);
        }
      }),
    );

    return () => {
      tap?.remove();
      received?.remove();
      rotated?.remove();
    };
  }, [router]);

  useEffect(() => subscribeLive(() => { if (pending.current) void spend.current(); }), []);

  useEffect(() => {
    const pendingOwner = pending.current?.owner;
    if (pendingOwner && pendingOwner !== user?.id) pending.current = null;
    if (!signedIn || !pending.current) return;
    const timer = setTimeout(() => { void spend.current(); }, 0);
    return () => clearTimeout(timer);
  }, [signedIn, user?.id, navigationReady, loading, sessionWait, router]);
}
