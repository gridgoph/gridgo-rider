import { Text, View } from "react-native";

import { SpecRow } from "@/components/SpecRow";
import {
  paymentMethodLabel,
  paymentStageLabel,
  receiptAdjustments,
  receiptIssuedLabel,
  receiptMoney,
  type AcknowledgementReceipt as Receipt,
} from "@/lib/acknowledgementReceipt";

type Props = {
  receipt: Receipt;
};

const TABULAR = { fontVariant: ["tabular-nums" as const] };

/**
 * The receipt as the rider copies it, top to bottom in the paper form's order:
 * number and party, each item, the fee and any adjustment, the grand total,
 * then how it was paid. Every figure is the server's — the subtotal is never
 * rebuilt from the unit rate, and nothing is summed here.
 *
 * Monochrome on purpose: none of this is the rider's money, so none of it
 * takes the earnings mark, and the screen's one yellow stays on its action.
 * Rows wrap rather than truncate, so a large text size still reads in full.
 */
export function AcknowledgementReceipt({ receipt }: Props) {
  const several = receipt.payments.length > 1;

  return (
    <View className="gap-6">
      <View className="gap-1 rounded-field bg-surface-variant p-4">
        <Text className="text-overline text-text-muted">AR NUMBER</Text>
        <Text selectable className="text-h2 text-text-primary" style={TABULAR}>
          {receipt.arNumber}
        </Text>
      </View>

      <View>
        <SpecRow label="Order number" value={receipt.orderNumber} />
        <SpecRow label="Date" value={receiptIssuedLabel(receipt.issuedAt)} />
        <SpecRow label="Issued to" value={receipt.issuedTo} last />
      </View>

      <View className="gap-3">
        <Text className="text-overline text-text-muted">ITEMS</Text>
        {receipt.lines.map((line) => (
          <View key={line.id} className="rounded-field border border-outline px-4 pt-3">
            <Text selectable className="text-body-lg font-bold text-text-primary">
              {line.description}
            </Text>
            <SpecRow label="Quantity" value={String(line.quantity)} />
            <SpecRow
              label="Unit rate"
              value={line.unitPriceMinor === null ? "Not recorded" : receiptMoney(line.unitPriceMinor)}
            />
            <SpecRow label="Subtotal" value={receiptMoney(line.subtotalMinor)} last />
          </View>
        ))}
        <Text className="text-body text-text-muted">
          Unit rates are indicative. Copy each item&apos;s subtotal as shown.
        </Text>
      </View>

      <View>
        {receiptAdjustments(receipt).map((row) => (
          <SpecRow key={row.label} label={row.label} value={row.value} />
        ))}
        <View className="flex-row flex-wrap items-baseline justify-between gap-x-4 border-t-2 border-accent pt-3">
          <Text className="text-h3 text-text-primary">Grand total</Text>
          <Text selectable className="text-h3 text-text-primary" style={TABULAR}>
            {receiptMoney(receipt.grandTotalMinor)}
          </Text>
        </View>
      </View>

      <View className="gap-3">
        <Text className="text-overline text-text-muted">{several ? "PAYMENTS" : "PAYMENT"}</Text>
        {receipt.payments.map((payment) => (
          <View key={payment.code}>
            {several ? (
              <Text className="text-body-lg font-bold text-text-primary">{paymentStageLabel(payment.code)}</Text>
            ) : null}
            <SpecRow label="Payment type" value={paymentMethodLabel(payment)} />
            <SpecRow label="Reference" value={payment.reference ?? "Not recorded"} />
            {payment.type === "cash" ? (
              <>
                <SpecRow label="Amount" value={receiptMoney(payment.amountMinor)} />
                <SpecRow
                  label="Amount received"
                  value={payment.amountReceivedMinor === null ? "Not recorded" : receiptMoney(payment.amountReceivedMinor)}
                />
                <SpecRow
                  label="Change"
                  value={payment.changeMinor === null ? "Not recorded" : receiptMoney(payment.changeMinor)}
                  last
                />
              </>
            ) : (
              <SpecRow label="Amount" value={receiptMoney(payment.amountMinor)} last />
            )}
          </View>
        ))}
        <Text className="text-body text-text-secondary">
          Already paid. There is nothing to collect at the door.
        </Text>
      </View>

      <Text className="text-body text-text-muted">{receipt.note}</Text>
    </View>
  );
}
