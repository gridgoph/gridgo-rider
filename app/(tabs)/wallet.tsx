import { useReadVersion } from "@/hooks/useReadVersion";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { ApprovalChip } from "@/components/ApprovalChip";
import { ApprovalNotice } from "@/components/ApprovalNotice";
import { EarningAmount } from "@/components/EarningAmount";
import { EmptyState } from "@/components/EmptyState";
import { WalletCard } from "@/components/WalletCard";
import { InlineNotice } from "@/components/InlineNotice";
import { Screen } from "@/components/Screen";
import { EarningsSkeleton } from "@/components/SkeletonScreens";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { approvalPresentation } from "@/lib/riderApproval";
import { cashEnabled } from "@/lib/cash";
import { earningsDayLabel, summariseEarnings } from "@/lib/riderEarnings";
import { useSession } from "@/store/session";

/**
 * The rider's money: the cash wallet, then what they earned.
 *
 * The wallet (gridgo-api#360, `GET /me/rider-wallet`) is what cash jobs draw
 * on — accepting one holds GRIDGO's share of it — so it leads, with its
 * balance, top-up and every movement (`WalletCard`). While a Super Admin has
 * cash switched off, top-up and the cash wording go but the balance and its
 * history stay readable: money already in a wallet does not vanish with the
 * setting. Earnings stay below it as they were.
 *
 * The demo backend has no payouts endpoint, so every earnings figure is derived
 * from the rider's own delivered orders. The footnote says exactly that rather
 * than implying a settled statement. Each figure is the rider's share of the
 * fee (`riderPayoutMinor`); the gross the client paid is secondary, under it.
 */
export default function WalletScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const beginRead = useReadVersion();
  const user = useSession((s) => s.user);
  const approval = approvalPresentation(user);

  const [orders, setOrders] = useState<api.Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [wallet, setWallet] = useState<Awaited<ReturnType<typeof api.getRiderWallet>> | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [cashOn, setCashOn] = useState(false);
  const beginWalletRead = useReadVersion();
  const canWork = approval.canWork;

  // Approved riders only: the route answers 403 to anyone else, and an
  // unapproved account sees its approval notice instead.
  const reloadWallet = useCallback(async () => {
    const isCurrent = beginWalletRead();
    if (!canWork) return;
    const [settings, next] = await Promise.allSettled([api.getSettings(), api.getRiderWallet()]);
    if (!isCurrent()) return;
    if (settings.status === "fulfilled") setCashOn(cashEnabled(settings.value));
    if (next.status === "fulfilled") {
      setWallet(next.value);
      setWalletError(null);
    } else {
      setWalletError(
        api.apiErrorMessage(next.reason, "Your wallet did not load. Check the phone's connection and pull down to try again."),
      );
    }
  }, [beginWalletRead, canWork]);

  const reload = useCallback(async () => {
    const isCurrent = beginRead();
    try {
      const next = await api.listOrders();
      if (!isCurrent()) return;
      setOrders(next);
      setError(null);
    } catch (e) {
      if (!isCurrent()) return;
      setError(
        api.apiErrorMessage(
          e,
          "Your earnings did not load. Check the phone's connection and pull down to try again.",
        ),
      );
      setOrders((current) => current ?? []);
    }
  }, [beginRead]);

  /*
    The pull gesture owns `refreshing`. Setting it on focus spun the
    pull-to-refresh control over the title every time the rider opened this
    tab, with no pull behind it. The figures still re-fetch on focus — quietly,
    under the totals already on screen.
  */
  const pullToRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([reload(), reloadWallet()]);
    } finally {
      setRefreshing(false);
    }
  }, [reload, reloadWallet]);

  useLiveRefresh(["orders", "payouts", "identity"], reload);
  useLiveRefresh(["orders", "payouts", "settings", "identity"], reloadWallet);

  useFocusEffect(
    useCallback(() => {
      void reload();
      void reloadWallet();
    }, [reload, reloadWallet]),
  );

  const summary = useMemo(
    () => summariseEarnings(orders ?? [], user?.id ?? null),
    [orders, user?.id],
  );

  return (
    <Screen edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page gap-6 pb-10 pt-3"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void pullToRefresh()}
            tintColor={colors.textMuted}
          />
        }
      >
        <ScreenHeader
          title="Wallet"
          subtitle={cashOn ? "Your cash wallet, and what you earned." : "Your balance, and what you earned."}
          status={<ApprovalChip />}
        />

        {!approval.canWork ? <ApprovalNotice /> : null}

        {approval.canWork ? (
          <WalletCard
            wallet={wallet}
            error={walletError}
            cashOn={cashOn}
            onRetry={() => void reloadWallet()}
            onTopup={(amountMinor) =>
              router.push({ pathname: "/wallet/topup", params: amountMinor ? { amount: String(amountMinor) } : {} })
            }
          />
        ) : null}

        {orders !== null && approval.canWork ? (
          <Text className="pt-2 text-h3 text-text-primary" accessibilityRole="header">
            Earnings
          </Text>
        ) : null}

        {error && approval.canWork ? (
          <InlineNotice
            tone="error"
            icon="circle-x"
            title="Earnings did not load"
            body={error}
            actionLabel="Try again"
            onAction={() => void reload()}
          />
        ) : null}

        {orders === null && approval.canWork ? <EarningsSkeleton /> : null}

        {orders !== null && approval.canWork ? (
          <>
            {/* Today, as one number. The reason a rider opens this tab. */}
            <View className="gg-card gap-1">
              <Text className="text-overline text-text-muted">EARNED TODAY</Text>
              <EarningAmount minor={summary.todayMinor} size="display" className="self-start" />
              <Text className="text-body text-text-secondary">
                {summary.todayCount === 0
                  ? "No deliveries closed yet today."
                  : summary.todayCount === 1
                    ? "1 delivery closed today."
                    : `${summary.todayCount} deliveries closed today.`}
              </Text>
            </View>

            {summary.entries.length ? (
              <View className="gap-3">
                <Text className="text-overline text-text-muted">DELIVERIES</Text>
                <View className="gg-card-flush">
                  {summary.entries.map((entry, index) => (
                    <View
                      key={entry.orderId}
                      className={
                        index === summary.entries.length - 1
                          ? "min-h-14 flex-row items-start justify-between gap-4 p-4"
                          : "min-h-14 flex-row items-start justify-between gap-4 border-b border-outline-subtle p-4"
                      }
                      accessibilityRole="text"
                      accessibilityLabel={`${entry.title}, ${earningsDayLabel(entry.at)}, you earned ${api.formatPhp(entry.feeMinor)}${entry.detail ? `, ${entry.detail}` : ""}`}
                    >
                      <View className="min-w-0 flex-1 gap-0.5">
                        <Text className="text-body-lg text-text-primary" numberOfLines={1}>
                          {entry.title}
                        </Text>
                        <Text className="text-body text-text-secondary" numberOfLines={1}>
                          {entry.dropoff}
                        </Text>
                        <Text className="text-caption text-text-muted">
                          {earningsDayLabel(entry.at)}
                        </Text>
                      </View>
                      <View className="items-end gap-0.5">
                        <EarningAmount minor={entry.feeMinor} size="h3" />
                        {entry.detail ? (
                          <Text className="text-caption text-text-muted">
                            {`of ${api.formatPhp(entry.deliveryFeeMinor)}`}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
                <Text className="text-caption text-text-muted">
                  {`${api.formatPhp(summary.allTimeMinor)} across ${summary.entries.length} ${summary.entries.length === 1 ? "delivery" : "deliveries"} on this account${summary.split ? ", after GRIDGO's share of each delivery fee" : ""}. Operations settles the payout.`}
                </Text>
              </View>
            ) : null}

            {!summary.entries.length && !error ? (
              <EmptyState
                icon="earnings"
                title="Nothing earned yet"
                body="Every delivery you close adds your share of its fee here. The fee is banded by how far the drop-off is from the shop."
              />
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
