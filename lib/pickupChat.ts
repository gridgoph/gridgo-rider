/*
  Messages between the rider and the shop they collect a job from
  (C2BE8E7A, gridgoph/gridgo-supplier#148). The shop app has the same
  conversation with the shop's words.

  Built like the client conversation in `lib/deliveryChat.ts`, and the API
  decides the window the same way, saying so on the order as `pickupChat`:
  `open` from the moment the rider accepts the pick-up until the job is
  finished, `read_only` for one day after delivery (or after the job is left at
  GRIDGO Office), and absent otherwise. This module reads that answer and words
  it; it never works the window out from the order's state.

  It is a different conversation with a different person. Every word here names
  the shop, so a rider holding two open chats on one job cannot mistake which
  one they are writing in. The shop never sees the client's details through it,
  and the rider never sees a shop member's phone or email.
*/

import { closesAtLabel, type DeliveryChatAttachment } from "@/lib/deliveryChat";

export type PickupChatStatus = "open" | "read_only";

export type PickupChatSummary = {
  status: PickupChatStatus;
  /** When a finished conversation is removed. Null while it is open. */
  closesAt: string | null;
  retentionHours: number;
  /** Messages from the shop this rider has not opened yet. */
  unread: number;
};

export type PickupChatMessage = {
  id: string;
  senderRole: "supplier" | "rider";
  /** Empty when a photo is the whole message. */
  body: string;
  attachments?: DeliveryChatAttachment[];
  createdAt: string;
  mine: boolean;
};

export const PICKUP_CHAT_IMAGE_PURPOSE = "pickup_chat_image";
export const PICKUP_CHAT_ROUTE = "/trip/shop-messages" as const;

/** The order's conversation with its shop, or null when it has none or sent something unknown. */
export function pickupChatOf(order: { pickupChat?: unknown } | null | undefined): PickupChatSummary | null {
  const raw = order?.pickupChat;
  if (!raw || typeof raw !== "object") return null;
  const { status, closesAt, retentionHours, unread } = raw as Record<string, unknown>;
  if (status !== "open" && status !== "read_only") return null;
  return {
    status,
    closesAt: typeof closesAt === "string" && Number.isFinite(Date.parse(closesAt)) ? closesAt : null,
    retentionHours: typeof retentionHours === "number" && retentionHours > 0 ? retentionHours : 24,
    unread: unreadCount(unread),
  };
}

function unreadCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  return value === true ? 1 : 0;
}

/** "1 new" / "3 new" / "9+ new" for the row's badge, or null with nothing unread. */
export function unreadBadgeLabel(unread: number): string | null {
  if (unread <= 0) return null;
  return `${unread > 9 ? "9+" : unread} new`;
}

export function pickupChatRoute(orderId: string): { pathname: typeof PICKUP_CHAT_ROUTE; params: { orderId: string } } {
  return { pathname: PICKUP_CHAT_ROUTE, params: { orderId } };
}

/** The row on the trip that opens the conversation with the shop. */
export function pickupChatEntry(chat: PickupChatSummary, now: Date | number = Date.now()) {
  const unread = chat.unread > 0 ? `${chat.unread === 1 ? "1 new message" : `${chat.unread} new messages`} from the shop. ` : "";
  if (chat.status === "open") {
    return {
      title: "Message the shop",
      detail: "Ask about collecting this job. The shop sees your first name only.",
      accessibilityLabel: `${unread}Message the shop about this pick-up`,
    };
  }
  return {
    title: "Messages with the shop",
    detail: chat.closesAt
      ? `Job finished. Readable until ${closesAtLabel(chat.closesAt, now)}, then removed.`
      : `Job finished. Removed ${chat.retentionHours} hours after delivery.`,
    accessibilityLabel: `${unread}Read your messages with the shop`,
  };
}

/** The line under the conversation's heading. */
export function pickupChatNotice(chat: Pick<PickupChatSummary, "status" | "closesAt" | "retentionHours">, now: Date | number = Date.now()): string {
  if (chat.status === "open") {
    return `Only you and the shop see these messages. The client does not. They are removed ${chat.retentionHours} hours after delivery.`;
  }
  return chat.closesAt
    ? `This job is finished, so no new messages can be sent. These are removed at ${closesAtLabel(chat.closesAt, now)}.`
    : "This job is finished, so no new messages can be sent.";
}

/** Read off the body rather than through `instanceof ApiError`, like `lib/deliveryChat.ts`. */
function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const body = (error as { body?: unknown }).body;
  if (body && typeof body === "object" && "error" in body) return String((body as { error: unknown }).error);
  return null;
}

/**
 * Why the conversation with the shop cannot be shown, or null when the error
 * is something else (a dropped connection) that a retry may fix.
 */
export function pickupChatUnavailable(error: unknown): { title: string; body: string } | null {
  const code = errorCode(error);
  if (code === "pickup_chat_closed") {
    return {
      title: "These messages were removed",
      body: "Messages with the shop are removed one day after the job is finished. For anything about this job, message Operations.",
    };
  }
  if (code === "pickup_chat_not_available") {
    return {
      title: "No shop to message yet",
      body: "Messages with the shop open once you accept the pick-up, and stay while the job is yours.",
    };
  }
  if (code === "forbidden" || code === "order_not_found") {
    return {
      title: "This conversation is not available",
      body: "Only the shop and the rider on a job can read its messages. If the job was moved to another rider, this conversation closed for you.",
    };
  }
  return null;
}

/** Copy for a message to the shop that did not go through. */
export function pickupSendError(error: unknown, maxLength: number): string {
  const code = errorCode(error);
  if (code === "pickup_chat_read_only") {
    return "This job is finished, so no new messages can be sent.";
  }
  if (code === "too_many_requests") {
    return "You are sending messages too fast. Wait a moment and try again.";
  }
  if (code === "invalid_request") {
    return `Write a message of up to ${maxLength} characters, or add a photo.`;
  }
  if (code === "invalid_chat_image") {
    return "That photo could not be sent. Choose a JPEG, PNG, or WebP of up to 15 MB.";
  }
  if (code === "file_already_attached") {
    return "That photo was already sent. Choose it again to send it once more.";
  }
  return "That did not reach the shop. Check your connection and send it again.";
}
