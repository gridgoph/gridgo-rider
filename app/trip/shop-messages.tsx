import { TripChatScreen } from "@/components/TripChatScreen";

/**
 * Messages with the shop this job is collected from (C2BE8E7A). Opened from
 * the trip, a past job, or a `pickup_chat_message` push; `lib/pickupChat.ts`
 * holds the rules and the words.
 */
export default function TripShopMessagesScreen() {
  return <TripChatScreen party="shop" />;
}
