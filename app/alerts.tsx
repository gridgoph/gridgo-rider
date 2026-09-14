import { useReadVersion } from "@/hooks/useReadVersion";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { AlertCard } from "@/components/AlertCard";
import { EmptyState } from "@/components/EmptyState";
import { InlineNotice } from "@/components/InlineNotice";
import { PushEnableCard } from "@/components/PushEnableCard";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { AlertListSkeleton } from "@/components/SkeletonScreens";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { useNotifications } from "@/store/notifications";
import { askConfirm } from "@/store/sheets";

/**
 * What dispatch has said, newest first, and where each job stands now.
 *
 * A pushed route rather than a tab: the content is dispatch pings and trip
 * movements, both of which already live where the rider acts on them, so this
 * is a place you visit when the bell says to — not a home.
 *
 * The orders are loaded alongside the alerts so each card can show its job's
 * real stage. A failure to load them is not a failure to load the alerts: the
 * list still renders, just without the bars, because a message a rider has not
 * read yet matters more than the diagram under it.
 *
 * "Clear notifications" asks first, then deletes each row on GRIDGO. The
 * button is only drawn while there is something to clear.
 */
export default function AlertsScreen() {
  const router = useRouter();
  const colors = useThemeColors();

  const load = useNotifications((s) => s.load);
  const items = useNotifications((s) => s.items);
  const error = useNotifications((s) => s.loadError);
  const markRead = useNotifications((s) => s.markRead);
  const markAllRead = useNotifications((s) => s.markAllRead);
  const clear = useNotifications((s) => s.clear);
  const readIds = useNotifications((s) => s.readIds);
  const hydrate = useNotifications((s) => s.hydrate);

  const [orders, setOrders] = useState<api.Order[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const nextRead = useReadVersion();
  const reload = useCallback(
    async (mode: "load" | "refresh" = "load") => {
      const current = nextRead();
      if (mode === "refresh") setRefreshing(true);
      const loaded = await load().then(() => true, () => false);
      if (!current()) return;
      if (loaded) setClearError(null);
      setRefreshing(false);
      // Separately, and quietly: the stage bars are an enrichment, not the list.
      try {
        const orders = await api.listOrders();
        if (current()) setOrders(orders);
      } catch {
        if (current()) setOrders([]);
      }
    },
    [nextRead, load],
  );

  useLiveRefresh(["notifications", "orders"], reload);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const byId = useMemo(
    () => new Map(orders.map((order) => [order.id, order])),
    [orders],
  );

  const isRead = useCallback(
    (item: api.Notification) => item.read || readIds.includes(item.id),
    [readIds],
  );

  const unreadOnScreen = items?.filter((item) => !isRead(item)).length ?? 0;

  async function confirmClear() {
    if (!items?.length || clearing) return;
    const confirmed = await askConfirm({
      question: "Clear these notifications?",
      consequence:
        "They leave this list. The jobs they are about stay where they are — you can still open them from Offers and Active.",
      confirmLabel: "Clear notifications",
      cancelLabel: "Keep them",
      destructive: true,
    });
    if (!confirmed) return;
    setClearing(true);
    setClearError(null);
    try {
      const outcome = await clear(items);
      if (outcome.failed) {
        setClearError(
          outcome.cleared.length
            ? "GRIDGO could not clear every notification. Pull down to refresh, then try the ones that are still here."
            : "GRIDGO could not clear these notifications. Check the connection and try again.",
        );
      }
    } finally {
      setClearing(false);
    }
  }

  return (
    <Screen edges={["bottom"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page gap-4 pb-10 pt-4"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void reload("refresh")}
            tintColor={colors.textMuted}
          />
        }
      >
        <PushEnableCard spacing="below" />

        {error ? (
          <InlineNotice
            tone="error"
            icon="circle-x"
            title="Alerts did not load"
            body={error}
            actionLabel="Try again"
            onAction={() => void reload()}
          />
        ) : null}

        {clearError ? (
          <InlineNotice
            tone="error"
            icon="circle-x"
            title="Could not clear notifications"
            body={clearError}
          />
        ) : null}

        {items === null && !error ? <AlertListSkeleton /> : null}

        {items?.length ? (
          <>
            {unreadOnScreen > 1 ? (
              <SecondaryButton
                label={`Mark all ${unreadOnScreen} read`}
                onPress={() => markAllRead(items)}
              />
            ) : null}

            <SecondaryButton
              label="Clear notifications"
              disabled={clearing}
              onPress={() => void confirmClear()}
            />

            <View>
              {items.map((item) => (
                <AlertCard
                  key={item.id}
                  alert={item}
                  order={item.orderId ? (byId.get(item.orderId) ?? null) : null}
                  read={isRead(item)}
                  onMarkRead={() => markRead(item.id)}
                />
              ))}
            </View>

            <Text className="text-caption text-text-muted">
              Swipe an alert away to mark it read. Read marks are kept on this phone.
            </Text>
          </>
        ) : null}

        {items !== null && !items.length && !error ? (
          <EmptyState
            icon="offers"
            title="Nothing from dispatch"
            body="When a job is ready for you, or Operations needs something, it lands here. Until then the open offers are the place to look."
            actionLabel="Browse offers"
            onAction={() => router.replace("/(tabs)/offers")}
            secondaryAction
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}
