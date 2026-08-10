import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { AlertCard } from "@/components/AlertCard";
import { EmptyState } from "@/components/EmptyState";
import { InlineNotice } from "@/components/InlineNotice";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { AlertListSkeleton } from "@/components/SkeletonScreens";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { useNotifications } from "@/store/notifications";

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
 */
export default function AlertsScreen() {
  const router = useRouter();
  const colors = useThemeColors();

  const adopt = useNotifications((s) => s.adopt);
  const markRead = useNotifications((s) => s.markRead);
  const markAllRead = useNotifications((s) => s.markAllRead);
  const readIds = useNotifications((s) => s.readIds);
  const hydrate = useNotifications((s) => s.hydrate);

  const [items, setItems] = useState<api.Notification[] | null>(null);
  const [orders, setOrders] = useState<api.Order[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const reload = useCallback(
    async (mode: "load" | "refresh" = "load") => {
      if (mode === "refresh") setRefreshing(true);
      try {
        const list = await api.listNotifications();
        setItems(list);
        adopt(list);
        setError(null);
      } catch (e) {
        setError(
          api.apiErrorMessage(
            e,
            "Alerts did not load. Check the phone's connection and pull down to try again.",
          ),
        );
        setItems((current) => current ?? []);
      } finally {
        setRefreshing(false);
      }
      // Separately, and quietly: the stage bars are an enrichment, not the list.
      try {
        setOrders(await api.listOrders());
      } catch {
        setOrders([]);
      }
    },
    [adopt],
  );

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

        {items === null ? <AlertListSkeleton /> : null}

        {items?.length ? (
          <>
            {unreadOnScreen > 1 ? (
              <SecondaryButton
                label={`Mark all ${unreadOnScreen} read`}
                onPress={() => markAllRead(items)}
              />
            ) : null}

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
