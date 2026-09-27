import { Text, TextInput, View } from "react-native";

import { StatusChip, type StatusIconName, type StatusTone } from "@/components/StatusChip";
import { fieldInputStyle } from "@/constants/theme";
import { useThemeColors } from "@/hooks/useTheme";
import type { PickupCountItem } from "@/lib/api";
import {
  countVerdict,
  MAX_COUNT_DIGITS,
  parseCount,
  verdictLabel,
  type CountVerdict,
} from "@/lib/pickupCount";

type Props = {
  item: PickupCountItem;
  counted: number | null;
  onChange: (counted: number | null) => void;
  disabled?: boolean;
};

const VERDICT_STYLE: Record<
  Exclude<CountVerdict["kind"], "pending">,
  { tone: StatusTone; icon: StatusIconName }
> = {
  match: { tone: "success", icon: "circle-check" },
  short: { tone: "error", icon: "circle-x" },
  over: { tone: "warning", icon: "triangle-alert" },
};

/**
 * One line of the order, counted.
 *
 * The number the rider types is the loudest thing on the row; what the order
 * expects sits beside it in the quiet voice, as the thing to count against
 * rather than the answer. The field starts empty — an expected number in the
 * box would be a count nobody made.
 *
 * Once a number is in, the verdict says it in words ("20 short"), so the
 * rider and the supplier can both read the problem off the phone in sunlight
 * and in greyscale.
 */
export function PickupCountField({ item, counted, onChange, disabled = false }: Props) {
  const colors = useThemeColors();
  const verdict = countVerdict(item.expectedQuantity, counted);
  const label = verdictLabel(verdict);
  const expected = item.expectedQuantity.toLocaleString("en-PH");

  return (
    <View className="flex-row items-center gap-3 p-3">
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-body-lg text-text-primary" numberOfLines={2}>
          {item.itemName}
        </Text>
        <Text className="text-body text-text-muted" style={{ fontVariant: ["tabular-nums"] }}>
          Expected {expected}
        </Text>
        {verdict.kind !== "pending" && label ? (
          <View className="flex-row pt-1">
            <StatusChip {...VERDICT_STYLE[verdict.kind]} label={label} />
          </View>
        ) : null}
      </View>

      <View className={disabled ? "gg-disabled" : undefined}>
        <TextInput
          value={counted == null ? "" : String(counted)}
          onChangeText={(text) => onChange(parseCount(text))}
          editable={!disabled}
          keyboardType="number-pad"
          inputMode="numeric"
          returnKeyType="done"
          maxLength={MAX_COUNT_DIGITS}
          placeholder="Count"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={`Pieces counted of ${item.itemName}, expected ${expected}`}
          className="h-14 w-28 rounded-field border border-outline bg-surface text-h3 text-text-primary"
          style={[fieldInputStyle, { textAlign: "right", fontVariant: ["tabular-nums"] }]}
        />
      </View>
    </View>
  );
}
