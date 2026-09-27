import { X } from "lucide-react-native";
import { Text, View } from "react-native";

import { InlineNotice } from "@/components/InlineNotice";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import type { Order } from "@/lib/api";
import { checkDefinition } from "@/lib/pickupChecklist";
import { recordedCountLines, verdictLabel } from "@/lib/pickupCount";

type Props = {
  order: Pick<Order, "pickupChecklist" | "pickupCountItems">;
};

/**
 * What the pickup screen becomes once a check has failed.
 *
 * The first line answers the only question a rider has at that moment — can I
 * take it? — and the second says who knows. Under that is the receipt of what
 * was sent, read back from the server's record rather than from the phone's
 * draft, so what the rider sees is what Operations and the shop see: each
 * failed check, the count against what was expected, and the rider's note.
 */
export function PickupBlockedPanel({ order }: Props) {
  const colors = useThemeColors();
  const record = order.pickupChecklist;
  const failed = (record?.checks ?? []).filter((check) => !check.passed);
  const lines = recordedCountLines(order);
  const photos = record?.evidenceFileIds.length ?? 0;

  return (
    <View className="gap-4">
      <InlineNotice
        tone="error"
        icon="circle-x"
        title="Pickup blocked. Operations has been alerted."
        body="Leave the package at the shop. Operations and the shop have what you found. When it is sorted you get an alert here — then count and check again from the start."
      />

      <View className="gg-card-flush" accessibilityRole="summary">
        <View className="gap-0.5 border-b border-outline-subtle p-4">
          <Text className="text-body-lg font-bold text-text-primary">What you reported</Text>
          {photos > 0 ? (
            <Text className="text-caption text-text-muted">
              {photos === 1 ? "1 photo sent" : `${photos} photos sent`} with the note below.
            </Text>
          ) : null}
        </View>

        {failed.map((check) => {
          const failure = checkDefinition(check.code).failure;
          return (
            <View key={check.code} className="gap-3 border-b border-outline-subtle p-4">
              <View className="flex-row items-start gap-3">
                <View
                  className="mt-0.5 h-5 w-5 items-center justify-center rounded-pill"
                  style={{ backgroundColor: colors.error }}
                >
                  <X size={12} color={colors.accentOn} strokeWidth={3} />
                </View>
                <Text className="min-w-0 flex-1 text-body text-text-primary">
                  {failure.charAt(0).toUpperCase()}
                  {failure.slice(1)}
                </Text>
              </View>

              {check.code === "quantity_match" && lines ? (
                <View className="gap-2 pl-8">
                  {lines.map((line) => {
                    const label = verdictLabel(line.verdict);
                    return (
                      <View key={line.key} className="flex-row items-center gap-3">
                        <View className="min-w-0 flex-1">
                          <Text className="text-body text-text-secondary" numberOfLines={2}>
                            {line.itemName}
                          </Text>
                          <Text
                            className="text-caption text-text-muted"
                            style={{ fontVariant: ["tabular-nums"] }}
                          >
                            Counted {line.countedQuantity.toLocaleString("en-PH")} of{" "}
                            {line.expectedQuantity.toLocaleString("en-PH")}
                          </Text>
                        </View>
                        {line.verdict.kind === "match" ? (
                          <StatusChip tone="success" icon="circle-check" label="Matches" />
                        ) : (
                          <StatusChip
                            tone={line.verdict.kind === "short" ? "error" : "warning"}
                            icon={line.verdict.kind === "short" ? "circle-x" : "triangle-alert"}
                            label={label ?? ""}
                          />
                        )}
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}

        {record?.failureNote ? (
          <View className="gap-1 p-4">
            <Text className="text-caption text-text-muted">Your note</Text>
            <Text className="text-body text-text-secondary">{record.failureNote}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
