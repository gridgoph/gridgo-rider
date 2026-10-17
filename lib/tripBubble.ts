import { Platform } from "react-native";

import type { Notification, Order } from "@/lib/api";
import { isActiveTripState } from "@/lib/riderOrder";
import { TripBubbleModule } from "@/modules/trip-bubble";

/**
 * The delivery bubble (gridgo-rider#116): while a delivery is active and the
 * rider is in another app — their navigation, almost always — a small GRIDGO
 * button floats over it. One tap returns to the job; a number on it counts
 * the unread messages and order updates for that job.
 *
 * Android only. iOS does not let an app draw over another, so there is no
 * bubble, no question about it, and nothing else changes. The rider grants
 * "Display over other apps" on the phone's own screen (Android has no dialog
 * for it), and saying no changes nothing else in the app.
 *
 * These are the rules; `hooks/useTripBubble.ts` applies them and
 * `modules/trip-bubble` draws the bubble.
 */

/** `unavailable`: this phone or build has no bubble at all. */
export type BubblePermission = "granted" | "denied" | "unavailable";

type BubbleNative = typeof TripBubbleModule;

export function readBubblePermission(
  os: string = Platform.OS,
  native: BubbleNative = TripBubbleModule,
): BubblePermission {
  if (os !== "android" || !native) return "unavailable";
  try {
    return native.canDrawOverlays() ? "granted" : "denied";
  } catch {
    return "unavailable";
  }
}

/** The phone's "Display over other apps" switch for GRIDGO. Never throws. */
export async function openBubbleSettings(native: BubbleNative = TripBubbleModule): Promise<void> {
  try {
    await native?.openOverlaySettings();
  } catch {
    // No settings screen to open. The Settings row stays to try again.
  }
}

export type BubbleInput = {
  permission: BubblePermission;
  /** The signed-in rider, or null. */
  userId: string | null;
  /** Approved and not on hold: the same gate as trip tracking. */
  canWork: boolean;
  order: Pick<Order, "id" | "riderId" | "state"> | null;
};

/** The job the bubble is for, or null when there should be no bubble. */
export function bubbleOrderId({ permission, userId, canWork, order }: BubbleInput): string | null {
  if (permission !== "granted" || !userId || !canWork || !order) return null;
  if (order.riderId !== userId || !isActiveTripState(order.state)) return null;
  return order.id;
}

/**
 * Unread alerts about this job. Chat messages from the client and the shop
 * each leave an inbox notice for the order (`delivery_message`,
 * `pickup_chat_message`), so the inbox alone counts both messages and order
 * updates without counting a message twice. Read marks are the Alerts
 * screen's, so the bubble and the Alerts badge never disagree.
 */
export function bubbleUnread(
  items: readonly Pick<Notification, "id" | "read" | "orderId">[] | null,
  readIds: readonly string[],
  orderId: string,
): number {
  if (!items) return 0;
  const marked = new Set(readIds);
  return items.reduce(
    (n, item) => n + (item.orderId === orderId && !item.read && !marked.has(item.id) ? 1 : 0),
    0,
  );
}

/** What TalkBack reads on the bubble. */
export function bubbleLabel(count: number): string {
  if (count <= 0) return "GRIDGO. Open your delivery";
  const unread = count === 1 ? "1 new message or update" : `${count} new messages and updates`;
  return `GRIDGO, ${unread}. Open your delivery`;
}

/** The foreground-service notice Android requires while the bubble runs. */
export const BUBBLE_NOTICE = {
  title: "Delivery bubble is on",
  body: "Tap the GRIDGO bubble to come back to your delivery. It goes away when the delivery ends.",
  channel: "Delivery bubble",
} as const;

/** Where a tap on the bubble lands: the job in hand. */
export const BUBBLE_ROUTE = "/(tabs)/active" as const;

/**
 * Away from GRIDGO the inbox stream is closed, so the count is re-read on the
 * background location service's fixes, no more often than the foreground's
 * own fallback refresh.
 */
export const BUBBLE_BACKGROUND_REFRESH_MS = 30_000;

export function backgroundRefreshDue(lastMs: number | null, nowMs: number): boolean {
  return lastMs === null || nowMs - lastMs >= BUBBLE_BACKGROUND_REFRESH_MS;
}

/** The Settings row. */
export function bubbleSettingsRow(permission: Exclude<BubblePermission, "unavailable">) {
  return permission === "granted"
    ? {
        value: "On",
        detail: "Shows over your map app during a delivery. Tap to turn it off in the phone's settings.",
      }
    : {
        value: "Off",
        detail: "A bubble over your map app that brings you back to the delivery. Tap to allow it.",
      };
}
