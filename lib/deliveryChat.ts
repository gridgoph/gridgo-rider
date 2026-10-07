/*
  Messages between the rider and the client whose order they carry
  (gridgo-client#198, gridgo-api `docs/OPERATIONAL_MODEL_V2_API.md#delivery-messages`).
  The client app has the same module with the client's words.

  The API decides the window and says so on the order as `deliveryChat`:
  `open` while the rider has the job, `read_only` for one day after delivery,
  and absent otherwise. This module only reads that answer and words it. It
  never works the window out from the order's state, because a second copy of
  the rule is how a screen offers a conversation the server has deleted.

  There is no call button. Neither side ever sees the other's phone number;
  calling waits on a masked-call service.

  A message may carry photos (gridgo-client#218), uploaded as
  `delivery_chat_image` and drawn with the support chat's `ChatPhoto`. Only the
  client and the rider can open them, and they go with the conversation.
*/

export type DeliveryChatStatus = "open" | "read_only";

export type DeliveryChatSummary = {
  status: DeliveryChatStatus;
  /** When a delivered conversation is removed. Null while it is open. */
  closesAt: string | null;
  retentionHours: number;
};

export type DeliveryChatAttachment = {
  fileId: string;
  contentType?: string | null;
  originalFilename?: string | null;
};

export type DeliveryChatMessage = {
  id: string;
  senderRole: "client" | "rider";
  /** Empty when a photo is the whole message. */
  body: string;
  /** Absent from an API older than delivery chat photos. */
  attachments?: DeliveryChatAttachment[];
  createdAt: string;
  mine: boolean;
};

export const DELIVERY_MESSAGE_MAX = 1000;
export const DELIVERY_CHAT_IMAGE_PURPOSE = "delivery_chat_image";
export const DELIVERY_CHAT_ROUTE = "/trip/messages" as const;
/** How often an open conversation asks for new messages while on screen. */
export const DELIVERY_CHAT_POLL_MS = 5_000;

/** The order's conversation, or null when it has none or sent something unknown. */
export function deliveryChatOf(order: { deliveryChat?: unknown } | null | undefined): DeliveryChatSummary | null {
  const raw = order?.deliveryChat;
  if (!raw || typeof raw !== "object") return null;
  const { status, closesAt, retentionHours } = raw as Record<string, unknown>;
  if (status !== "open" && status !== "read_only") return null;
  return {
    status,
    closesAt: typeof closesAt === "string" && Number.isFinite(Date.parse(closesAt)) ? closesAt : null,
    retentionHours: typeof retentionHours === "number" && retentionHours > 0 ? retentionHours : 24,
  };
}

export function deliveryChatRoute(orderId: string): { pathname: typeof DELIVERY_CHAT_ROUTE; params: { orderId: string } } {
  return { pathname: DELIVERY_CHAT_ROUTE, params: { orderId } };
}

/** "3:40 PM today" / "9:05 AM tomorrow" / "Thu, Oct 9, 9:05 AM", in Davao time. */
export function closesAtLabel(closesAt: string, now: Date | number = Date.now()): string {
  const at = new Date(closesAt);
  const time = at.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
  const day = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const today = new Date(now);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  if (day(at) === day(today)) return `${time} today`;
  if (day(at) === day(tomorrow)) return `${time} tomorrow`;
  const date = at.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${date}, ${time}`;
}

/** The row on the trip that opens the conversation. */
export function deliveryChatEntry(chat: DeliveryChatSummary, now: Date | number = Date.now()) {
  if (chat.status === "open") {
    return {
      title: "Message the client",
      detail: "Ask for a gate, a landmark or who will receive it. Neither of you sees a phone number.",
      accessibilityLabel: "Message the client about this delivery",
    };
  }
  return {
    title: "Messages with the client",
    detail: chat.closesAt
      ? `Delivered. Readable until ${closesAtLabel(chat.closesAt, now)}, then removed.`
      : `Delivered. Removed ${chat.retentionHours} hours after delivery.`,
    accessibilityLabel: "Read your messages with the client",
  };
}

/** The line under the conversation's heading. */
export function deliveryChatNotice(chat: DeliveryChatSummary, now: Date | number = Date.now()): string {
  if (chat.status === "open") {
    return `Only you and the client see these messages. They are removed ${chat.retentionHours} hours after delivery.`;
  }
  return chat.closesAt
    ? `This delivery is finished, so no new messages can be sent. These are removed at ${closesAtLabel(chat.closesAt, now)}.`
    : "This delivery is finished, so no new messages can be sent.";
}

export function senderLabel(message: Pick<DeliveryChatMessage, "mine">): string {
  return message.mine ? "You" : "Client";
}

export type DeliveryChatUnavailable = { title: string; body: string };

/**
 * The API's `error` code. Read off the body rather than through `instanceof
 * ApiError`, so this module never imports the client at run time.
 */
function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const body = (error as { body?: unknown }).body;
  if (body && typeof body === "object" && "error" in body) return String((body as { error: unknown }).error);
  return null;
}

/**
 * Why the conversation cannot be shown, or null when the error is something
 * else (a dropped connection) that a retry may fix.
 */
export function deliveryChatUnavailable(error: unknown): DeliveryChatUnavailable | null {
  const code = errorCode(error);
  if (code === "delivery_chat_closed") {
    return {
      title: "These messages were removed",
      body: "Messages with the client are removed one day after delivery. For anything about this job, message Operations.",
    };
  }
  if (code === "delivery_chat_not_available") {
    return {
      title: "No client to message on this job",
      body: "Messages are for deliveries to the client's door while the job is yours. A job carried to GRIDGO Office has none.",
    };
  }
  if (code === "forbidden" || code === "order_not_found") {
    return {
      title: "This conversation is not available",
      body: "Only the client and the rider on a delivery can read its messages. If the job was moved to another rider, the conversation went with it.",
    };
  }
  return null;
}

/** Copy for a send that did not go through. */
export function deliverySendError(error: unknown): string {
  const code = errorCode(error);
  if (code === "delivery_chat_read_only") {
    return "This delivery is finished, so no new messages can be sent.";
  }
  if (code === "too_many_requests") {
    return "You are sending messages too fast. Wait a moment and try again.";
  }
  if (code === "invalid_request") {
    return `Write a message of up to ${DELIVERY_MESSAGE_MAX} characters, or add a photo.`;
  }
  if (code === "invalid_chat_image") {
    return "That photo could not be sent. Choose a JPEG, PNG, or WebP of up to 15 MB.";
  }
  if (code === "file_already_attached") {
    return "That photo was already sent. Choose it again to send it once more.";
  }
  return "That did not reach the client. Check your connection and send it again.";
}
