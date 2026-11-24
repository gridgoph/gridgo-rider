import { Banknote } from "lucide-react-native";
import { Text, View } from "react-native";

import { CashSlip } from "@/components/CashSlip";
import { CheckboxRow } from "@/components/CheckboxRow";
import { useThemeColors } from "@/hooks/useTheme";
import type { CashAmounts } from "@/lib/api";
import { shopCashConfirmLabel, walletHoldLine } from "@/lib/cash";

type Props = {
  amounts: CashAmounts;
  haveCash: boolean;
  onHaveCash: (value: boolean) => void;
  disabled?: boolean;
  /** A group order: the host pays the cash for the whole group. */
  receiver?: "client" | "host";
};

/**
 * What a cash offer asks of the rider, before Accept (gridgo-api#360): the
 * slip — pay the shop, collect, GRIDGO's share, you keep — what accepting does
 * to the wallet, and the one tick that says they have the shop's cash on them
 * now. The tick starts empty every time; the server refuses an accept without
 * it, and a rider who arrives at a counter without the cash strands the job.
 */
export function CashOfferTerms({ amounts, haveCash, onHaveCash, disabled = false, receiver = "client" }: Props) {
  const colors = useThemeColors();
  return (
    <View className="gap-3" testID="cash-offer-terms">
      <View className="flex-row items-center gap-2">
        <Banknote size={18} color={colors.textPrimary} strokeWidth={2} />
        <Text className="text-body-lg font-bold text-text-primary">Cash job</Text>
      </View>
      <CashSlip amounts={amounts} receiver={receiver} />
      <Text className="text-caption text-text-secondary">{walletHoldLine(amounts, receiver)}</Text>
      <CheckboxRow
        checked={haveCash}
        onChange={onHaveCash}
        label={shopCashConfirmLabel(amounts)}
        hint="You pay the shop before you check the job."
        disabled={disabled}
        testID="cash-offer-have-cash"
      />
    </View>
  );
}
