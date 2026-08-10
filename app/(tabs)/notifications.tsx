import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { InlineNotice } from "@/components/InlineNotice";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { formatRelativeAt, unreadCount } from "@/lib/riderOrder";
import { useNotifications } from "@/store/notifications";

export default function NotificationsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const setUnread = useNotifications((s) => s.setUnread);
  const [items, setItems] = useState<api.Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    async (mode: "load" | "refresh" = "load") => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      try {
        const list = await api.listNotifications();
        setItems(list);
        setUnread(unreadCount(list));
        setError(null);
      } catch (e) {
        setError(api.apiErrorMessage(e, "Could not load alerts. Pull down to try again."));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [setUnread],
  );

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <SafeAreaView className="gg-screen" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page gap-6 pb-10 pt-6"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void reload("refresh")}
            tintColor={colors.textMuted}
          />
        }
      >
        {/*
          No unread count here: the Alerts tab already carries that badge, and
          a number repeated two inches away is a structural device saying
          nothing new.
        */}
        <View className="gap-2">
          <Text className="text-h1 text-text-primary">Alerts</Text>
          <Text className="text-body-lg text-text-secondary">
            Dispatch and trip updates for this account.
          </Text>
        </View>

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

        {loading && !items.length ? (
          <View className="items-center gap-3 pt-6">
            <ActivityIndicator color={colors.textMuted} />
            <Text className="text-body text-text-muted">Loading alerts…</Text>
          </View>
        ) : null}

        {items.length ? (
          <View className="gap-3">
            {items.map((item) => (
              <View
                key={item.id}
                className={
                  item.read
                    ? "gg-card gap-2"
                    : "gap-2 rounded-card border-2 border-accent bg-surface p-4"
                }
              >
                <View className="flex-row items-start justify-between gap-3">
                  <Text className="min-w-0 flex-1 text-body-lg font-bold text-text-primary">
                    {item.title}
                  </Text>
                  {item.read ? null : <StatusChip tone="info" label="Unread" icon="bell" />}
                </View>
                <Text className="text-body text-text-secondary">{item.body}</Text>
                <Text className="text-caption text-text-muted">{formatRelativeAt(item.at)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {!loading && !items.length && !error ? (
          <EmptyState
            title="No alerts yet"
            body="When a job is ready for dispatch or your trip moves, it lands here. Until then, the open offers are the place to look."
            actionLabel="Browse offers"
            onAction={() => router.push("/(tabs)/offers")}
            secondaryAction
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
