/**
 * Local "you've arrived" alert.
 *
 * This is not a server push. The geofence lives on the phone, and the same
 * Expo module that handles FCM can also draw a one-shot local notification.
 * Every native call is wrapped: Expo Go Android has no push module, and a
 * throw here must cost the alert, never the trip.
 */
import { Platform } from "react-native";

import type { ArrivalCopy } from "@/lib/arrival";
import { loadExpoNotifications } from "@/lib/expoNotifications";
import { PUSH_CHANNEL_ID } from "@/lib/push";
import type { NextStopKind } from "@/lib/tripNav";

export async function presentArrivalNotification(input: {
  copy: ArrivalCopy;
  orderId: string;
  kind: NextStopKind;
  key: string;
}): Promise<void> {
  const Notifications = loadExpoNotifications();
  if (!Notifications) return;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `arrival:${input.key}`,
      content: {
        title: input.copy.question,
        body: input.copy.consequence,
        sound: true,
        data: {
          type: "arrival",
          orderId: input.orderId,
          kind: input.kind,
        },
      },
      trigger:
        Platform.OS === "android" ? { channelId: PUSH_CHANNEL_ID } : null,
    });
  } catch {
    // Local alerts are a courtesy. The in-app sheet still lands.
  }
}
