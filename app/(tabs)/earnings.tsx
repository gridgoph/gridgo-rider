import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { ApprovalChip } from "@/components/ApprovalChip";
import { ApprovalNotice } from "@/components/ApprovalNotice";
import { EmptyState } from "@/components/EmptyState";
import { InlineNotice } from "@/components/InlineNotice";
import { Screen } from "@/components/Screen";
import { EarningsSkeleton } from "@/components/SkeletonScreens";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { approvalPresentation } from "@/lib/riderApproval";
import { earningsDayLabel, summariseEarnings } from "@/lib/riderEarnings";
import { useSession } from "@/store/session";

/**
 * What today paid.
 *
 * This screen used to carry a second, louder figure: the customer cash the
 * rider was holding until Operations reconciled it. Cash on delivery is gone,
 * so that number is gone with it, and everything on screen is now the rider's
 * own money — which is the whole reason the two were ever kept apart.
 *
 * The demo backend has no payouts endpoint, so every figure here is derived
 * from the rider's own delivered orders. The footnote says exactly that rather
 * than implying a settled statement.
 */
export default function EarningsScreen() {
  const colors = useThemeColors();
  const user = useSession((s) => s.user);
  const approval = approvalPresentation(user);

  const [orders, setOrders] = useState<api.Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    try {
      setOrders(await api.listOrders());
      setError(null);
    } catch (e) {
      setError(
        api.apiErrorMessage(
          e,
          "Your earnings did not load. Check the phone's connection and pull down to try again.",
        ),
      );
      setOrders((current) => current ?? []);
    }
  }, []);

  /*
    The pull gesture owns `refreshing`. Setting it on focus spun the
    pull-to-refresh control over the title every time the rider opened this
    tab, with no pull behind it. The figures still re-fetch on focus — quietly,
    under the totals already on screen.
  */
  const pullToRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
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
          title="Earnings"
          subtitle="Delivery fees from jobs you closed."
          status={<ApprovalChip />}
        />

        {!approval.canWork ? <ApprovalNotice /> : null}

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
              <Text className="text-display text-text-primary">
                {api.formatPhp(summary.todayMinor)}
              </Text>
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
                      accessibilityLabel={`${entry.title}, ${earningsDayLabel(entry.at)}, you earned ${api.formatPhp(entry.feeMinor)}`}
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
                      <Text className="text-h3 text-text-primary">
                        {api.formatPhp(entry.feeMinor)}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text className="text-caption text-text-muted">
                  {`${api.formatPhp(summary.allTimeMinor)} across ${summary.entries.length} ${summary.entries.length === 1 ? "delivery" : "deliveries"} on this account. Operations settles the payout.`}
                </Text>
              </View>
            ) : null}

            {!summary.entries.length && !error ? (
              <EmptyState
                icon="earnings"
                title="Nothing earned yet"
                body="Every delivery you close adds its fee here. The fee is banded by how far the drop-off is from the shop."
              />
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
