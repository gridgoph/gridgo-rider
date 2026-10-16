import { TripChatScreen } from "@/components/TripChatScreen";

/**
 * Messages with the client on one delivery (gridgo-client#198). Opened from
 * the trip or a past job; `lib/deliveryChat.ts` holds the rules and the words.
 */
export default function TripMessagesScreen() {
  return <TripChatScreen party="client" />;
}
