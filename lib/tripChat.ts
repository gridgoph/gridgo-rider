/*
  A job can hold two conversations at once: with the client it is delivered to
  (`lib/deliveryChat.ts`) and with the shop it is collected from
  (`lib/pickupChat.ts`). They are separate threads on separate routes, and the
  one screen that draws both takes its words from here, so every label, the
  composer's placeholder and the send button all name who will read it.
*/

import {
  DELIVERY_CHAT_IMAGE_PURPOSE,
  DELIVERY_MESSAGE_MAX,
  deliveryChatNotice,
  deliveryChatUnavailable,
  deliverySendError,
  type DeliveryChatSummary,
} from "@/lib/deliveryChat";
import {
  PICKUP_CHAT_IMAGE_PURPOSE,
  pickupChatNotice,
  pickupChatUnavailable,
  pickupSendError,
} from "@/lib/pickupChat";

export type TripChatParty = "client" | "shop";

export type TripChatWords = {
  /** Heading of the conversation: who is on the other end. */
  counterpart: string;
  /** Under each of their messages. */
  sender: string;
  openStatus: string;
  closedStatus: string;
  emptyOpen: string;
  emptyClosed: string;
  placeholder: string;
  inputLabel: string;
  sendLabel: string;
  imagePurpose: string;
  maxLength: number;
  notice: (chat: Pick<DeliveryChatSummary, "status" | "closesAt" | "retentionHours">) => string;
  unavailable: (error: unknown) => { title: string; body: string } | null;
  sendError: (error: unknown) => string;
};

const CLIENT: TripChatWords = {
  counterpart: "The client",
  sender: "Client",
  openStatus: "On this delivery",
  closedStatus: "Delivered",
  emptyOpen: "Ask the client for a gate, a landmark, or who will receive the package.",
  emptyClosed: "Nobody wrote during this delivery.",
  placeholder: "Write to the client",
  inputLabel: "Message the client",
  sendLabel: "Send to the client",
  imagePurpose: DELIVERY_CHAT_IMAGE_PURPOSE,
  maxLength: DELIVERY_MESSAGE_MAX,
  notice: deliveryChatNotice,
  unavailable: deliveryChatUnavailable,
  sendError: deliverySendError,
};

const SHOP: TripChatWords = {
  counterpart: "The shop",
  sender: "Shop",
  openStatus: "Where you collect this job",
  closedStatus: "Job finished",
  emptyOpen: "Tell the shop when you will arrive, or ask where to collect the job.",
  emptyClosed: "Nobody wrote to the shop during this job.",
  placeholder: "Write to the shop",
  inputLabel: "Message the shop",
  sendLabel: "Send to the shop",
  imagePurpose: PICKUP_CHAT_IMAGE_PURPOSE,
  maxLength: DELIVERY_MESSAGE_MAX,
  notice: pickupChatNotice,
  unavailable: pickupChatUnavailable,
  sendError: (error) => pickupSendError(error, DELIVERY_MESSAGE_MAX),
};

export function tripChatWords(party: TripChatParty): TripChatWords {
  return party === "shop" ? SHOP : CLIENT;
}

export function senderLabel(message: { mine: boolean }, party: TripChatParty): string {
  return message.mine ? "You" : tripChatWords(party).sender;
}

/**
 * The order the trip lists its conversations in. Before pick-up the rider is
 * heading to the shop, so the shop's thread leads; after, the client's does.
 */
export function tripChatOrder(state: string): TripChatParty[] {
  return state === "rider_assigned" ? ["shop", "client"] : ["client", "shop"];
}
