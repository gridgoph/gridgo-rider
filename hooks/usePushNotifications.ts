import { useRouter, type Href } from "expo-router";
import { useEffect, useRef } from "react";

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
 * `lib/push.ts`; everything it stores goes through `store/push.ts`. Ported from
 * `gridgo-supplier`; the one rider difference is that a tap is spent as soon as
 * someone is signed in. Supplier defers until the shop is `matchable`, because
 * its job workspace sits behind an accreditation guard. This app does not:
 * an unapproved rider lives in the tab shell, reads Alerts, and is exactly
 * the person whose approval they most want to hear about with the app closed.
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

/**
 * Make the unread badge agree with the platform.
 *
 * A foreground arrival is spent on this and nothing else. The Alerts list
 * already holds the same record, so this recomputes from the list rather than
 * adding to it. A failure costs nothing: every list in this app reloads on
 * focus.
 */
async function refreshUnread(): Promise<void> {
  await useNotifications.getState().refreshUnread();
}

export function usePushNotifications(): void {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const signedIn = isSignedIn(user);

  /**
   * A tap that arrived before there was anywhere to send it.
   *
   * An alert tapped from a cold start opens the app on the sign-in screen
   * only when no stored session comes back. Routing to Offers or Active then
   * would bounce off the auth gate, so the target waits here and is spent
   * when a session appears. This app persists the session, so the usual
   * cold-start path already has a user by the time the layout mounts.
   */
  const pending = useRef<string | null>(null);
  /** Response identifiers already routed, so a tap opens its screen once. */
  const routed = useRef(new Set<string>());

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
    const route = (identifier: string, data: unknown) => {
      if (routed.current.has(identifier)) return;
      routed.current.add(identifier);
      const target = pushTargetRoute(parsePushData(data));
      if (!isSignedIn(useSession.getState().user)) {
        pending.current = target;
        return;
      }
      // The push carries no job state by design, so the screen fetches the
      // trip itself. Re-read the list too: the record behind this push is
      // already in it, and its unread badge should not survive the tap.
      void refreshUnread();
      // `pushTargetRoute` returns a route this app declares; typed routes
      // cannot see that through a string it built at runtime.
      router.push(target as Href);
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
    // its whole effect is that the unread badge catches up.
    const received = withoutNativeModule(() =>
      Notifications.addNotificationReceivedListener(() => {
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

  useEffect(() => {
    if (!signedIn || !pending.current) return;
    const target = pending.current;
    pending.current = null;
    router.push(target as Href);
  }, [signedIn, router]);
}
