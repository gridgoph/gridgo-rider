import { Text, View } from "react-native";

import { EarningAmount } from "@/components/EarningAmount";
import type { CashAmounts } from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { cashSlipRows, signedPesos, type CashSlipRow } from "@/lib/cash";

type Props = {
  amounts: CashAmounts;
  /** Leave a row out where the screen already says it in its own words. */
  only?: readonly CashSlipRow["key"][];
  testID?: string;
};

/**
 * A cash job as a till slip: the money in the order it moves, amounts set
 * right on one column of tabular figures so a rider standing in the sun can
 * run their eye down it, and a rule before the line that is theirs.
 *
 * The sign is printed and the verb says which way the money goes, so nothing
 * depends on colour. The only yellow is "You keep", through `EarningAmount` —
 * the rider's own money, the same mark it carries everywhere else. GRIDGO's
 * share is the server's figure; nothing here adds anything up.
 */
export function CashSlip({ amounts, only, testID = "cash-slip" }: Props) {
  const rows = cashSlipRows(amounts).filter((row) => !only || only.includes(row.key));
  return (
    <View className="rounded-field border border-outline bg-surface-variant px-3 py-1" testID={testID}>
      {rows.map((row) =>
        row.sign === "keep" ? (
          <View
            key={row.key}
            className="mt-1 flex-row items-center justify-between gap-3 border-t border-outline py-3"
            accessibilityRole="text"
            accessibilityLabel={`${row.label}, ${formatPhp(row.minor)}`}
          >
            <Text className="text-body-lg font-bold text-text-primary">{row.label}</Text>
            <EarningAmount minor={row.minor} size="h3" />
          </View>
        ) : (
          <View
            key={row.key}
            className="min-h-11 flex-row items-center justify-between gap-3 py-2"
            accessibilityRole="text"
            accessibilityLabel={`${row.label}, ${row.sign === "out" ? "minus" : "plus"} ${formatPhp(row.minor)}${row.note ? `, ${row.note}` : ""}`}
          >
            <View className="min-w-0 flex-1">
              <Text className="text-body-lg text-text-primary">{row.label}</Text>
              {row.note ? <Text className="text-caption text-text-secondary">{row.note}</Text> : null}
            </View>
            <Text className="text-body-lg font-bold text-text-primary" style={{ fontVariant: ["tabular-nums"] }}>
              {signedPesos(row.minor, row.sign === "out" ? "out" : "in")}
            </Text>
          </View>
        ),
      )}
    </View>
  );
}

/**
 * One exact amount, large, with what to do with it — the shop's price at the
 * counter, the client's total at the door. Ink, not yellow: it is someone
 * else's money passing through the rider's hands.
 */
export function ExactCash({ label, minor, note, testID }: { label: string; minor: number; note?: string; testID?: string }) {
  return (
    <View className="gap-1" accessibilityRole="text" accessibilityLabel={`${label}, ${formatPhp(minor)}${note ? `. ${note}` : ""}`} testID={testID}>
      <Text className="text-body text-text-secondary">{label}</Text>
      <Text className="text-display text-text-primary" style={{ fontVariant: ["tabular-nums"] }}>
        {formatPhp(minor)}
      </Text>
      {note ? <Text className="text-body text-text-secondary">{note}</Text> : null}
    </View>
  );
}
