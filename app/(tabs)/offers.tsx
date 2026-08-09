import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { InlineNotice } from "@/components/InlineNotice";
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

  const reload = useCallback(
    async (mode: "load" | "refresh" = "load") => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      try {
        const [list, orders] = await Promise.all([api.listOffers(), api.listOrders()]);
        setOffers(selectOffers(list));
        setHasActive(Boolean(user && selectActiveTrip(orders, user.id)));
        setError(null);
      } catch (e) {
        setError(
          api.apiErrorMessage(
            e,
            "Could not load offers. Check your connection and pull down to try again.",
          ),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user],
  );

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
        api.apiErrorMessage(e, "Could not accept this offer. Pull down to refresh and try another."),
      );
    } finally {
      setBusyId(null);
    }
  }

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
        <View className="gap-2">
          <Text className="text-h1 text-text-primary">Offers</Text>
          <Text className="text-body-lg text-text-secondary">
            Jobs ready for pickup, newest first. You carry one at a time.
          </Text>
        </View>

        {hasActive ? (
          <InlineNotice
            tone="info"
            icon="info"
            title="You already have a trip in hand"
            body="Finish it, or hand the package back, before you take another job. New offers appear here once it is closed."
            actionLabel="Open my trip"
            onAction={() => router.push("/(tabs)/active")}
          />
        ) : null}

        {error ? (
          <InlineNotice
            tone="error"
            icon="circle-x"
            title="Offers did not load"
            body={error}
            actionLabel="Try again"
            onAction={() => void reload()}
          />
        ) : null}

        {loading && !offers.length ? (
          <View className="items-center gap-3 pt-6">
            <ActivityIndicator color={colors.textMuted} />
            <Text className="text-body text-text-muted">Loading offers…</Text>
          </View>
        ) : null}

        {offers.length ? (
          <View className="gap-4">
            {offers.map((job) => (
              <OfferCard
                key={job.id}
                offer={job}
                busy={busyId === job.id || hasActive}
                onAccept={() => void accept(job.id)}
              />
            ))}
          </View>
        ) : null}

        {/*
          When a trip is in hand the notice above already says what is going on
          and offers the next step, so an empty state repeating it would be a
          second invitation to the same place.
        */}
        {!loading && !offers.length && !error && !hasActive ? (
          <EmptyState
            title="No open offers"
            body="A job appears here the moment a supplier marks it ready, with its route and fee. Pull down to check again."
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
