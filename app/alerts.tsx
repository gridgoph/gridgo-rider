import { useFocusEffect, useRouter } from "expo-router";
import { Bell } from "lucide-react-native";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { EmptyState } from "@/components/EmptyState";
import { InlineNotice } from "@/components/InlineNotice";
import { Screen } from "@/components/Screen";
import { LoadingCard } from "@/components/Skeleton";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { formatRelativeAt, unreadCount } from "@/lib/riderOrder";
import { useNotifications } from "@/store/notifications";

/**
 * What dispatch has said, newest first.
 *
 * A pushed route rather than a tab: the content is dispatch pings and trip
 * movements, both of which already live where the rider acts on them, so this
 * is a place you visit when the bell says to — not a home.
 *
 * The demo API has no way to mark an alert read, so the unread mark stays as
 * the server reports it. Nothing here pretends otherwise.
 */
export default function AlertsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const setUnread = useNotifications((s) => s.setUnread);
  const [items, setItems] = useState<api.Notification[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    async (mode: "load" | "refresh" = "load") => {
      if (mode === "refresh") setRefreshing(true);
      try {
        const list = await api.listNotifications();
        setItems(list);
        setUnread(unreadCount(list));
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
    },
    [setUnread],
  );

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

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

        {items === null ? (
          <View className="gap-3">
            <LoadingCard label="Loading alerts" rows={2} />
            <LoadingCard label="Loading alerts" rows={2} />
          </View>
        ) : null}

        {items?.length ? (
          <View className="gg-card-flush">
            {items.map((item, index) => (
              <View
                key={item.id}
                className={
                  index === items.length - 1
                    ? "flex-row gap-3 p-4"
                    : "flex-row gap-3 border-b border-outline-subtle p-4"
                }
                accessibilityRole="text"
                accessibilityLabel={`${item.read ? "" : "Unread. "}${item.title}. ${item.body}. ${formatRelativeAt(item.at)}`}
              >
                {/*
                  Unread is a filled disc against an outlined one — shape, not
                  colour, so the list still reads in greyscale.
                */}
                <View
                  className={
                    item.read
                      ? "mt-1 h-8 w-8 items-center justify-center rounded-pill border border-outline"
                      : "mt-1 h-8 w-8 items-center justify-center rounded-pill bg-accent"
                  }
                >
                  <Bell
                    size={15}
                    strokeWidth={2}
                    color={item.read ? colors.textMuted : colors.accentOn}
                  />
                </View>
                <View className="min-w-0 flex-1 gap-1">
                  <Text
                    className={
                      item.read
                        ? "text-body-lg text-text-primary"
                        : "text-body-lg font-bold text-text-primary"
                    }
                  >
                    {item.title}
                  </Text>
                  <Text className="text-body text-text-secondary">{item.body}</Text>
                  <Text className="text-caption text-text-muted">
                    {formatRelativeAt(item.at)}
                    {item.read ? "" : " · Unread"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
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
