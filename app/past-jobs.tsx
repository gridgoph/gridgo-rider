import { useReadVersion } from "@/hooks/useReadVersion";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { ApprovalNotice } from "@/components/ApprovalNotice";
import { EmptyState } from "@/components/EmptyState";
import { InlineNotice } from "@/components/InlineNotice";
import { Screen } from "@/components/Screen";
import { PastJobsSkeleton } from "@/components/SkeletonScreens";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { approvalPresentation } from "@/lib/riderApproval";
import { earningsDayLabel } from "@/lib/riderEarnings";
import { listPastJobs, type PastJobEntry } from "@/lib/riderHistory";
import { useSession } from "@/store/session";

/**
 * Jobs this rider already accepted, once they are no longer the trip in hand.
 *
 * A pushed ledger, not a sixth tab: Offers, Active, Map, Earnings and Account
 * stay the daily destinations. This is where a rider finds a closed or
 * cancelled job and opens its trail — the same HISTORY rail as the live trip.
 */
export default function PastJobsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const beginRead = useReadVersion();
  const user = useSession((s) => s.user);
  const approval = approvalPresentation(user);

  const [orders, setOrders] = useState<api.Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
          "Past jobs did not load. Check the phone's connection and pull down to try again.",
        ),
      );
      setOrders((current) => current ?? []);
    }
  }, [beginRead]);

  const pullToRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  useLiveRefresh(["orders"], reload);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const entries = useMemo(
    () => listPastJobs(orders ?? [], user?.id ?? null),
    [orders, user?.id],
  );

  return (
    <Screen edges={["bottom"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page gap-6 pb-10 pt-4"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void pullToRefresh()}
            tintColor={colors.textMuted}
          />
        }
      >
        <Text className="text-body-lg text-text-secondary">
          Jobs you already carried. Open one to read its full trail.
        </Text>

        {!approval.canWork ? <ApprovalNotice /> : null}

        {error ? (
          <InlineNotice
            tone="error"
            icon="circle-x"
            title="Past jobs did not load"
            body={error}
            actionLabel="Try again"
            onAction={() => void reload()}
          />
        ) : null}

        {orders === null ? <PastJobsSkeleton /> : null}

        {orders !== null && entries.length ? (
          <View className="gg-card-flush">
            {entries.map((entry, index) => (
              <PastJobRow
                key={entry.orderId}
                entry={entry}
                last={index === entries.length - 1}
                onPress={() =>
                  router.push({ pathname: "/past-job", params: { orderId: entry.orderId } })
                }
              />
            ))}
          </View>
        ) : null}

        {orders !== null && !entries.length && !error ? (
          <EmptyState
            icon="offers"
            title="No past jobs yet"
            body="Take a job from Offers. When it closes, the whole trail lands here."
            actionLabel="See offers"
            onAction={() => router.replace("/(tabs)/offers")}
            secondaryAction
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function PastJobRow({
  entry,
  last,
  onPress,
}: {
  entry: PastJobEntry;
  last: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const when = earningsDayLabel(entry.at);
  const failed = entry.state === "cancelled";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${entry.title}, ${entry.statusLabel}, ${when}, ${api.formatPhp(entry.feeMinor)}`}
      accessibilityHint="Opens this job's trail"
      className={
        last
          ? "min-h-14 flex-row items-start gap-3 p-4"
          : "min-h-14 flex-row items-start gap-3 border-b border-outline-subtle p-4"
      }
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body-lg text-text-primary" numberOfLines={1}>
          {entry.title}
        </Text>
        <Text className="text-body text-text-secondary" numberOfLines={1}>
          {entry.pickup} → {entry.dropoff}
        </Text>
        <Text className="text-caption text-text-muted">{when}</Text>
      </View>
      <View className="items-end gap-0.5">
        <Text className="text-h3 text-text-primary">{api.formatPhp(entry.feeMinor)}</Text>
        <Text className={failed ? "text-caption text-error" : "text-caption text-text-muted"}>
          {entry.statusLabel}
        </Text>
      </View>
      <ChevronRight
        size={20}
        color={colors.textMuted}
        accessibilityElementsHidden
        style={{ marginTop: 4 }}
      />
    </Pressable>
  );
}
