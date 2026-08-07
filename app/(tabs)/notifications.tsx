import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { formatRelativeAt, unreadCount } from "@/lib/riderOrder";
import { useNotifications } from "@/store/notifications";

export default function NotificationsScreen() {
  const colors = useThemeColors();
  const setUnread = useNotifications((s) => s.setUnread);
  const [items, setItems] = useState<api.Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (mode: "load" | "refresh" = "load") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    try {
      const list = await api.listNotifications();
      setItems(list);
      setUnread(unreadCount(list));
      setError(null);
    } catch (e) {
      setError(
        api.apiErrorMessage(
          e,
          "Could not load alerts. Pull down to try again.",
        ),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setUnread]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const unread = unreadCount(items);

  return (
    <SafeAreaView className="gg-screen" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-8 pt-4"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void reload("refresh")}
            tintColor={colors.textMuted}
          />
        }
      >
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-h1 text-text-primary">Alerts</Text>
          {unread > 0 ? (
            <StatusChip
              tone="info"
              label={`${unread} unread`}
              icon="triangle-alert"
            />
          ) : null}
        </View>
        <Text className="mt-1 text-body text-text-secondary">
          Dispatch and trip updates for this account.
        </Text>

        {error ? (
          <View className="mt-4 rounded-card border border-error bg-surface p-4">
            <Text className="text-body text-error">{error}</Text>
          </View>
        ) : null}

        {loading && !items.length ? (
          <View className="mt-10 items-center">
            <ActivityIndicator color={colors.textMuted} />
          </View>
        ) : null}

        <View className="mt-6 gap-3">
          {items.map((n) => (
            <View
              key={n.id}
              className={
                n.read
                  ? "rounded-card border border-outline bg-surface p-4"
                  : "rounded-card border border-accent bg-surface p-4"
              }
            >
              <View className="flex-row items-start justify-between gap-3">
                <Text className="min-w-0 flex-1 text-body-lg text-text-primary">
                  {n.title}
                </Text>
                {!n.read ? (
                  <StatusChip tone="info" label="New" icon="triangle-alert" />
                ) : null}
              </View>
              <Text className="mt-1 text-body text-text-secondary">{n.body}</Text>
              <Text className="mt-2 text-caption text-text-muted">
                {formatRelativeAt(n.at)}
              </Text>
            </View>
          ))}
        </View>

        {!loading && !items.length && !error ? (
          <EmptyState
            title="No alerts yet"
            body="When a job is ready for dispatch or your trip moves, it lands here."
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
