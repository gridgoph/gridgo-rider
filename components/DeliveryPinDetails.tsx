import { CircleCheck, Clock, Info, MapPinned, type LucideIcon } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { Order } from "@/lib/api";
import { deliveryPinView, type DeliveryPinStatus } from "@/lib/deliveryPin";

type Props = {
  order: Pick<Order, "deliveryPin" | "dropoffConfirmation" | "fulfillmentMode" | "dropoff">;
};

const STATUS: Record<DeliveryPinStatus, { icon: LucideIcon; token: "success" | "textMuted" }> = {
  confirmed: { icon: CircleCheck, token: "success" },
  pending: { icon: Clock, token: "textMuted" },
  none: { icon: Info, token: "textMuted" },
};

/**
 * Who meets the rider at the drop-off pin, and what the client said about it.
 *
 * Status first — icon, label and, when confirmed, the time — so it reads in
 * greyscale. Then the receiver by name only (the API never sends their phone)
 * and the client's note, set apart by a rule as their own words rather than
 * the app's. Unconfirmed is quiet, not a warning: confirming is optional and
 * the pin stands either way. No yellow — the card's yellow is its action.
 *
 * Renders nothing for a job ending at GRIDGO Office. Rules: `lib/deliveryPin.ts`.
 */
export function DeliveryPinDetails({ order }: Props) {
  const colors = useThemeColors();
  const view = deliveryPinView(order);
  if (!view) return null;
  const { icon: Icon, token } = STATUS[view.status];
  const hasPin = view.status !== "none" && Boolean(order.deliveryPin);

  return (
    <View className="gap-3">
      <View className="flex-row items-start gap-2" accessibilityRole="text">
        <View className="pt-0.5">
          <Icon size={18} color={colors[token]} strokeWidth={2} />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text
            className={
              view.status === "confirmed"
                ? "text-body font-bold text-success"
                : "text-body font-bold text-text-primary"
            }
          >
            {view.title}
          </Text>
          {view.detail ? (
            <Text className="text-caption text-text-muted">{view.detail}</Text>
          ) : null}
        </View>
      </View>

      {view.moved ? (
        <View className="flex-row items-start gap-2" accessibilityRole="text">
          <View className="pt-0.5">
            <MapPinned size={18} color={colors.textMuted} strokeWidth={2} />
          </View>
          <Text className="min-w-0 flex-1 text-body text-text-secondary">
            The client moved this pin before dispatch. This is the final drop-off.
          </Text>
        </View>
      ) : null}

      {hasPin ? (
        <View className="gap-0.5" accessibilityRole="text">
          <Text className="text-caption text-text-muted">Hand it to</Text>
          <Text className="text-body-lg font-medium text-text-primary">
            {view.receiverName ?? "The client"}
          </Text>
        </View>
      ) : null}

      {view.notes ? (
        <View className="gap-1" accessibilityRole="text">
          <Text className="text-caption text-text-muted">Note from the client</Text>
          <View className="border-l-2 border-outline pl-3">
            <Text className="text-body-lg text-text-primary">{view.notes}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
