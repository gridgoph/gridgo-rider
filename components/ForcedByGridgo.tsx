import { Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import type { Order } from "@/lib/api";
import { forcedStepNote } from "@/lib/shopHandover";

type Props = {
  order: Pick<Order, "forcedByGridgo" | "forcedSteps">;
};

/**
 * "Forced by GRIDGO": Operations moved this job past a shop step without its
 * usual evidence (gridgo-api `docs/SHOP_HANDOVER_API.md`, *Forced steps*).
 *
 * Every app shows the tag. The rider also gets the reason, because what was
 * skipped is the shop's own proof of the finished work — the rider's check at
 * the counter is then the first look anyone has had. Nothing when the job was
 * never forced.
 */
export function ForcedByGridgo({ order }: Props) {
  if (!order.forcedByGridgo) return null;
  const note = forcedStepNote(order);

  return (
    <View className="items-start gap-1">
      <StatusChip tone="warning" icon="triangle-alert" label="Forced by GRIDGO" />
      {note ? (
        <Text className="text-caption text-text-secondary">GRIDGO&apos;s reason: {note}</Text>
      ) : null}
    </View>
  );
}
