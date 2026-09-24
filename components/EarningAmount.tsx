import { Text, View } from "react-native";

import { formatPhp } from "@/lib/api";

const SIZE_CLASS = {
  display: "text-display",
  h1: "text-h1",
  h3: "text-h3",
  body: "text-body font-bold",
} as const;

type Props = {
  /** PHP minor units — the rider's share of a delivery fee (`riderPay`), or a sum of them. */
  minor: number;
  size: keyof typeof SIZE_CLASS;
  /** Wrapper placement in the parent, e.g. `self-start` in a stretching column. */
  className?: string;
};

/**
 * The rider's own money, marked in GRIDGO yellow.
 *
 * Yellow text on a white card fails contrast, so Light draws a highlighter
 * band behind the lower half of dark digits, and Dark — where yellow reads —
 * sets the digits themselves in yellow with no band. Both come from the
 * `earning-ink` / `earning-mark` tokens, so the switch is the same CSS
 * variable swap every other colour uses.
 *
 * The band is deliberately not a filled box: the primary CTA is a whole yellow
 * rectangle with a verb in it, and this must never read as something to tap.
 */
export function EarningAmount({ minor, size, className }: Props) {
  return (
    <View className={className ? `relative ${className}` : "relative"}>
      <View
        testID="earning-mark"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="absolute -left-1 -right-1 bottom-[8%] top-[48%] bg-earning-mark"
      />
      <Text className={`${SIZE_CLASS[size]} text-earning-ink`}>{formatPhp(minor)}</Text>
    </View>
  );
}
