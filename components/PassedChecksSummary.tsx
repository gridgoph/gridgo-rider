import { Check } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { PICKUP_CHECKS } from "@/lib/pickupChecklist";
import type { RecordedCountLine } from "@/lib/pickupCount";

type Props = {
  /** When the sixth answer was given, already formatted. Null if unknown. */
  checkedAt: string | null;
  /** The pieces counted per line. Null on an API without counts. */
  counts?: RecordedCountLine[] | null;
};

/**
 * The six checks, passed, at a glance.
 *
 * Sits above the signature pad so the person signing sees what they are
 * signing for without scrolling back. Two columns of six short rows rather
 * than the checklist's full rows: the checking is done, and this is the
 * receipt for it. Each row is a glyph and a label so it survives greyscale;
 * the green is the app's success token and the only colour on the card.
 *
 * Under the six, the count: each line with the number counted against the
 * number ordered, so the signer puts their name to the figures and not only
 * to a list of ticks.
 */
export function PassedChecksSummary({ checkedAt, counts }: Props) {
  const colors = useThemeColors();

  return (
    <View className="gg-card gap-3" accessibilityRole="summary">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="text-body-lg text-text-primary">Six checks passed</Text>
        {checkedAt ? (
          <Text className="text-caption text-text-muted">Checked at {checkedAt}</Text>
        ) : null}
      </View>

      <View className="flex-row flex-wrap">
        {PICKUP_CHECKS.map((check) => (
          <View
            key={check.code}
            className="w-1/2 flex-row items-center gap-2 py-1 pr-2"
            accessibilityLabel={`${check.label}: passed`}
          >
            <View
              className="h-5 w-5 items-center justify-center rounded-pill"
              style={{ backgroundColor: colors.success }}
            >
              <Check size={12} color={colors.accentOn} strokeWidth={3} />
            </View>
            <Text className="min-w-0 flex-1 text-body text-text-secondary" numberOfLines={1}>
              {check.label}
            </Text>
          </View>
        ))}
      </View>

      {counts?.length ? (
        <View className="gap-2 border-t border-outline-subtle pt-3">
          <Text className="text-caption text-text-muted">Counted together</Text>
          {counts.map((line) => {
            const counted = line.countedQuantity.toLocaleString("en-PH");
            const expected = line.expectedQuantity.toLocaleString("en-PH");
            return (
              <View
                key={line.key}
                className="flex-row items-baseline gap-3"
                accessibilityLabel={`${line.itemName}: counted ${counted} of ${expected}`}
              >
                <Text className="min-w-0 flex-1 text-body text-text-secondary" numberOfLines={2}>
                  {line.itemName}
                </Text>
                <Text
                  className="text-body-lg font-bold text-text-primary"
                  style={{ fontVariant: ["tabular-nums"] }}
                >
                  {counted}
                  <Text className="text-body text-text-muted"> of {expected}</Text>
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
