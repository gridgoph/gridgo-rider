import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import * as api from "@/lib/api";

export default function OffersScreen() {
  const [offers, setOffers] = useState<api.Order[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await api.listOffers();
      setOffers(list.filter((o) => o.state === "ready_for_dispatch"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    }
  }, []);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  async function accept(id: string) {
    setBusy(id);
    try {
      await api.acceptOffer(id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "accept_failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView className="flex-1 bg-canvas px-5 pt-14">
      <Text className="font-satoshi-bold text-2xl text-text-primary">Offers</Text>
      <Text className="mt-1 font-satoshi text-text-secondary">Ready for dispatch</Text>
      {error ? <Text className="mt-3 font-satoshi text-error">{error}</Text> : null}
      {offers.map((job) => (
        <View key={job.id} className="mt-4 rounded-2xl border border-outline bg-surface p-4">
          <Text className="font-satoshi-medium text-text-primary">{job.title}</Text>
          <Text className="mt-1 font-satoshi text-sm text-text-muted">{job.address}</Text>
          <Text className="mt-1 font-satoshi text-sm text-text-secondary">
            Delivery fee {api.formatPhp(job.deliveryFeeMinor)}
            {job.paymentMethod === "cod" ? " · COD" : ""}
          </Text>
          <Pressable
            className="mt-3 items-center rounded-xl bg-action-yellow py-3"
            disabled={busy === job.id}
            onPress={() => void accept(job.id)}
          >
            <Text className="font-satoshi-medium text-action-yellow-on">Accept job</Text>
          </Pressable>
        </View>
      ))}
      {!offers.length && !error ? (
        <Text className="mt-6 font-satoshi text-text-muted">No open offers right now.</Text>
      ) : null}
      <View className="h-12" />
    </ScrollView>
  );
}
