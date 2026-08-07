import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { OfferCard } from "@/components/OfferCard";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { selectActiveTrip, selectOffers } from "@/lib/riderOrder";
import { useSession } from "@/store/session";

export default function OffersScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { user } = useSession();
  const [offers, setOffers] = useState<api.Order[]>([]);
  const [hasActive, setHasActive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async (mode: "load" | "refresh" = "load") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    try {
      const [list, orders] = await Promise.all([
        api.listOffers(),
        api.listOrders(),
      ]);
      setOffers(selectOffers(list));
      setHasActive(Boolean(user && selectActiveTrip(orders, user.id)));
      setError(null);
    } catch (e) {
      setError(
        api.apiErrorMessage(
          e,
          "Could not load offers. Check your connection and try again.",
        ),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  async function accept(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api.acceptOffer(id);
      await reload();
      router.push("/(tabs)/active");
    } catch (e) {
      setError(
        api.apiErrorMessage(
          e,
          "Could not accept this offer. Pull to refresh and try another.",
        ),
      );
    } finally {
      setBusyId(null);
    }
  }

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
        <Text className="text-h1 text-text-primary">Offers</Text>
        <Text className="mt-1 text-body text-text-secondary">
          Jobs ready for pickup. Distance and time help you decide. One active
          trip at a time.
        </Text>

        {hasActive ? (
          <Pressable
            onPress={() => router.push("/(tabs)/active")}
            accessibilityRole="button"
            accessibilityLabel="Open your active trip"
            className="mt-4 rounded-card border border-accent bg-surface p-4"
          >
            <Text className="text-body text-text-primary">
              You already have a trip in hand. Finish it before accepting another.
            </Text>
            <Text className="mt-1 text-button text-text-primary">Open active trip</Text>
          </Pressable>
        ) : null}

        {error ? (
          <View className="mt-4 rounded-card border border-error bg-surface p-4">
            <Text className="text-body text-error">{error}</Text>
            <Pressable
              onPress={() => void reload()}
              accessibilityRole="button"
              className="gg-touch mt-2 justify-center"
            >
              <Text className="text-button text-text-primary">Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {loading && !offers.length ? (
          <View className="mt-10 items-center">
            <ActivityIndicator color={colors.textMuted} />
            <Text className="mt-3 text-body text-text-muted">Loading offers…</Text>
          </View>
        ) : null}

        <View className="mt-6 gap-4">
          {offers.map((job) => (
            <OfferCard
              key={job.id}
              offer={job}
              busy={busyId === job.id || hasActive}
              onAccept={() => void accept(job.id)}
            />
          ))}
        </View>

        {!loading && !offers.length && !error ? (
          <EmptyState
            title="No open offers"
            body={
              hasActive
                ? "Finish your active trip, then pull to refresh for the next job."
                : "When a supplier marks a job ready for dispatch, it shows up here with map and distance. Pull down to refresh."
            }
            actionLabel={hasActive ? "Open active trip" : undefined}
            onAction={hasActive ? () => router.push("/(tabs)/active") : undefined}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
