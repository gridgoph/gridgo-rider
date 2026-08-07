import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GridgoLogo } from "@/components/GridgoLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StatusChip } from "@/components/StatusChip";
import * as api from "@/lib/api";
import {
  orderStateLabel,
  selectActiveTrip,
  selectOffers,
  unreadCount,
} from "@/lib/riderOrder";
import { useNotifications } from "@/store/notifications";
import { useSession } from "@/store/session";

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useSession();
  const setUnreadGlobal = useNotifications((s) => s.setUnread);
  const [offerCount, setOfferCount] = useState(0);
  const [active, setActive] = useState<api.Order | null>(null);
  const [unread, setUnread] = useState(0);
  const [loadError, setLoadError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          const [orders, notifications] = await Promise.all([
            api.listOrders(),
            api.listNotifications(),
          ]);
          if (!alive) return;
          setOfferCount(selectOffers(orders).length);
          setActive(user ? selectActiveTrip(orders, user.id) : null);
          const count = unreadCount(notifications);
          setUnread(count);
          setUnreadGlobal(count);
          setLoadError(false);
        } catch {
          if (alive) {
            setOfferCount(0);
            setActive(null);
            setUnread(0);
            setLoadError(true);
          }
        }
      })();
      return () => {
        alive = false;
      };
    }, [user, setUnreadGlobal]),
  );

  const firstName = user?.name?.split(" ")[0] || "Rider";

  return (
    <SafeAreaView className="gg-screen" edges={["top"]}>
      <View className="gg-page flex-1 gap-6 pt-4">
        <GridgoLogo />
        <View>
          <Text className="text-h1 text-text-primary">Hi, {firstName}</Text>
          <Text className="mt-1 text-body text-text-secondary">
            Accept jobs, pick up, deliver, collect COD when required.
          </Text>
        </View>

        {loadError ? (
          <View className="rounded-card border border-error bg-surface p-4">
            <Text className="text-body text-error">
              Could not refresh your dashboard. Open Offers or Active and pull to refresh.
            </Text>
          </View>
        ) : null}

        <View className="flex-row gap-3">
          <Pressable
            onPress={() => router.push("/(tabs)/offers")}
            accessibilityRole="button"
            accessibilityLabel={`${offerCount} open offers`}
            className="gg-card min-h-11 flex-1"
          >
            <Text className="text-caption text-text-muted">Open offers</Text>
            <Text className="mt-1 text-display text-text-primary">{offerCount}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/(tabs)/notifications")}
            accessibilityRole="button"
            accessibilityLabel={`${unread} unread alerts`}
            className="gg-card min-h-11 flex-1"
          >
            <Text className="text-caption text-text-muted">Unread alerts</Text>
            <Text className="mt-1 text-display text-text-primary">{unread}</Text>
          </Pressable>
        </View>

        {active ? (
          <View className="gg-card gap-3">
            <Text className="text-overline text-text-muted">ACTIVE TRIP</Text>
            <Text className="text-h3 text-text-primary">{active.title}</Text>
            <StatusChip
              tone="info"
              label={orderStateLabel(active.state)}
              icon="clock"
            />
            <Text className="text-body text-text-secondary">{active.address}</Text>
            <PrimaryButton
              label="Open active trip"
              onPress={() => router.push("/(tabs)/active")}
            />
          </View>
        ) : (
          <View className="gg-card gap-3">
            <Text className="text-overline text-text-muted">NEXT STEP</Text>
            <Text className="text-h3 text-text-primary">No trip in hand</Text>
            <Text className="text-body text-text-secondary">
              {offerCount > 0
                ? `${offerCount} offer${offerCount === 1 ? "" : "s"} waiting. Accept one to start.`
                : "When a supplier marks a job ready, it appears in Offers."}
            </Text>
            <PrimaryButton
              label={offerCount > 0 ? "Browse offers" : "Check offers"}
              onPress={() => router.push("/(tabs)/offers")}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
