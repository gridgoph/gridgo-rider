import {
  ArrowDownToLine,
  Banknote,
  Lock,
  LockOpen,
  Percent,
  ShieldAlert,
  Undo2,
  type LucideIcon,
} from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { InlineNotice } from "@/components/InlineNotice";
import { SkeletonText } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import {
  chipPesos,
  deltaLabel,
  outsideWalletLabel,
  topupAmounts,
  topupStatusChip,
  walletRows,
  type WalletRow,
} from "@/lib/cash";
import { earningsDayLabel } from "@/lib/riderEarnings";

type WalletRead = Awaited<ReturnType<typeof api.getRiderWallet>>;

type Props = {
  wallet: WalletRead | null;
  error: string | null;
  /** A Super Admin has cash on. Off, the balance and history stay; top-up and cash wording go. */
  cashOn: boolean;
  onRetry: () => void;
  onTopup: (amountMinor: number | null) => void;
};

const ROW_ICONS: Record<WalletRow["icon"], LucideIcon> = {
  topup: ArrowDownToLine,
  hold: Lock,
  release: LockOpen,
  share: Percent,
  cash: Banknote,
  credit: Undo2,
  claim: ShieldAlert,
};

/**
 * The cash wallet, read top to bottom the way a rider asks about it: how much
 * is there, can I take a cash job, how do I add more, where did it go.
 *
 * The balance is ink, not yellow — it is a float the rider tops up, not money
 * they earned, and the yellow mark stays with earnings. Low balance is an
 * icon + label + colour chip, never colour alone. Top-up amounts are
 * monochrome pills: they open the top-up screen, where the one yellow action is.
 * Every figure is the server's integer centavos, formatted here and never
 * added up here.
 */
export function WalletCard({ wallet, error, cashOn, onRetry, onTopup }: Props) {
  const colors = useThemeColors();

  if (!wallet) {
    return error ? (
      <InlineNotice tone="error" icon="circle-x" title="Wallet did not load" body={error} actionLabel="Try again" onAction={onRetry} />
    ) : (
      <View className="gg-card gap-3" accessibilityLabel="Loading your wallet">
        <SkeletonText width="40%" />
        <SkeletonText width="60%" height={38} />
        <SkeletonText />
        <SkeletonText width="80%" />
      </View>
    );
  }

  const { balanceMinor, availableMinor, reservedMinor, lowBalance } = wallet.wallet;
  const rows = walletRows(wallet.activity, { cashOn });
  const outside = outsideWalletLabel(cashOn);
  const openClaims = wallet.incidents.filter((incident) => incident.remainingMinor > 0);

  return (
    <View className="gap-6" testID="wallet-card">
      <View className="gg-card gap-4">
        <View className="gap-1" accessibilityRole="text" accessibilityLabel={`Wallet balance, ${api.formatPhp(balanceMinor)}`}>
          <Text className="text-body text-text-secondary">Wallet balance</Text>
          <Text className="text-display text-text-primary" style={{ fontVariant: ["tabular-nums"] }} testID="wallet-balance">
            {api.formatPhp(balanceMinor)}
          </Text>
        </View>

        <View className="gap-2 border-t border-outline-subtle pt-3">
          <AmountRow label={cashOn ? "Available for cash jobs" : "Available"} minor={availableMinor} />
          {reservedMinor > 0 ? <AmountRow label="Held for jobs in hand" minor={reservedMinor} /> : null}
        </View>

        {cashOn && lowBalance ? (
          <View className="gap-2" testID="wallet-low-balance">
            <View className="flex-row">
              <StatusChip tone="warning" icon="triangle-alert" label="Low balance" />
            </View>
            <Text className="text-body text-text-secondary">
              {"Under ₱100. Accepting a cash job holds GRIDGO's share from here, so top up to keep taking them."}
            </Text>
          </View>
        ) : null}

        {cashOn ? (
          <View className="gap-2 border-t border-outline-subtle pt-3">
            <Text className="text-body font-bold text-text-primary">Top up</Text>
            <View className="flex-row gap-2">
              {topupAmounts(wallet.wallet).map((minor) => (
                <Pressable
                  key={minor}
                  onPress={() => onTopup(minor)}
                  accessibilityRole="button"
                  accessibilityLabel={`Top up ${chipPesos(minor)}`}
                  className="min-h-11 flex-1 items-center justify-center rounded-full border border-accent bg-surface px-3"
                  style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
                  testID={`wallet-topup-${minor}`}
                >
                  <Text className="text-body-lg font-bold text-text-primary">{chipPesos(minor)}</Text>
                </Pressable>
              ))}
            </View>
            <Text className="text-caption text-text-secondary">
              {"Pay GRIDGO's QR, then send the reference. Operations adds it once they find your payment."}
            </Text>
          </View>
        ) : null}
      </View>

      {openClaims.length ? (
        <InlineNotice
          tone="warning"
          icon="triangle-alert"
          title={openClaims.length === 1 ? "A claim with a shop is open" : `${openClaims.length} claims with shops are open`}
          body={`Operations is recovering ${api.formatPhp(openClaims.reduce((sum, claim) => sum + claim.remainingMinor, 0))} you paid at a counter. It returns to your wallet when the shop repays.`}
        />
      ) : null}

      <View className="gap-3">
        <Text className="text-h3 text-text-primary" accessibilityRole="header">
          Wallet activity
        </Text>
        {rows.length ? (
          <View className="gg-card-flush">
            {rows.map((row, index) => {
              const Icon = ROW_ICONS[row.icon];
              const chip = row.topup ? topupStatusChip(row.topup) : null;
              const amount =
                row.deltaMinor != null ? deltaLabel(row.deltaMinor) : row.cashMinor != null ? api.formatPhp(row.cashMinor) : "";
              return (
                <View
                  key={row.id}
                  className={
                    index === rows.length - 1
                      ? "min-h-14 flex-row items-start gap-3 p-4"
                      : "min-h-14 flex-row items-start gap-3 border-b border-outline-subtle p-4"
                  }
                  accessibilityRole="text"
                  accessibilityLabel={`${row.title}${chip ? `, ${chip.label}` : ""}, ${amount}${row.cashMinor != null && !row.topup ? `, ${outside.toLowerCase()}` : ""}, ${earningsDayLabel(row.at)}${row.detail ? `, ${row.detail}` : ""}`}
                  testID="wallet-activity-row"
                >
                  <View className="pt-0.5">
                    <Icon size={18} color={colors.textSecondary} strokeWidth={2} />
                  </View>
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="text-body-lg text-text-primary">{row.title}</Text>
                    {row.detail ? <Text className="text-body text-text-secondary">{row.detail}</Text> : null}
                    <Text className="text-caption text-text-muted">{earningsDayLabel(row.at)}</Text>
                  </View>
                  <View className="items-end gap-1">
                    <Text className="text-body-lg font-bold text-text-primary" style={{ fontVariant: ["tabular-nums"] }}>
                      {amount}
                    </Text>
                    {chip ? (
                      <StatusChip tone={chip.tone} icon={chip.icon} label={chip.label} />
                    ) : row.cashMinor != null ? (
                      <Text className="text-caption text-text-secondary">{outside}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <Text className="text-body text-text-secondary">
            {cashOn ? "No wallet activity yet. Top-ups and cash jobs show here." : "No wallet activity yet."}
          </Text>
        )}
      </View>
    </View>
  );
}

function AmountRow({ label, minor }: { label: string; minor: number }) {
  return (
    <View
      className="flex-row items-center justify-between gap-3"
      accessibilityRole="text"
      accessibilityLabel={`${label}, ${api.formatPhp(minor)}`}
    >
      <Text className="text-body-lg text-text-secondary">{label}</Text>
      <Text className="text-body-lg font-bold text-text-primary" style={{ fontVariant: ["tabular-nums"] }}>
        {api.formatPhp(minor)}
      </Text>
    </View>
  );
}
