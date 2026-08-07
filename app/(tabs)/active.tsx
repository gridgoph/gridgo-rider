import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import * as api from "@/lib/api";

export default function ActiveScreen() {
  const [jobs, setJobs] = useState<api.Order[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await api.listOffers();
      setJobs(list.filter((o) => o.state !== "ready_for_dispatch"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    }
  }, []);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  async function proof(id: string, kind: string, nextHint: string) {
    setBusy(id);
    try {
      await api.requestProof(id, kind);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : nextHint);
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView className="flex-1 bg-canvas px-5 pt-14">
      <Text className="font-satoshi-bold text-2xl text-text-primary">Active trip</Text>
      {error ? <Text className="mt-3 font-satoshi text-error">{error}</Text> : null}
      {jobs.map((job) => (
        <View key={job.id} className="mt-4 rounded-2xl border border-outline bg-surface p-4">
          <Text className="font-satoshi-medium text-text-primary">{job.title}</Text>
          <Text className="mt-1 font-satoshi text-sm text-text-muted">{job.address}</Text>
          <Text className="mt-1 font-satoshi text-sm text-text-secondary">{job.state.replaceAll("_", " ")}</Text>
          {job.state === "rider_assigned" ? (
            <Pressable
              className="mt-3 items-center rounded-xl bg-action-yellow py-3"
              disabled={busy === job.id}
              onPress={() => void proof(job.id, "pickup", "pickup_failed")}
            >
              <Text className="font-satoshi-medium text-action-yellow-on">Confirm pickup (OTP demo)</Text>
            </Pressable>
          ) : null}
          {job.state === "picked_up" || job.state === "out_for_delivery" ? (
            <Pressable
              className="mt-3 items-center rounded-xl bg-action-yellow py-3"
              disabled={busy === job.id}
              onPress={() => void proof(job.id, "delivery", "delivery_failed")}
            >
              <Text className="font-satoshi-medium text-action-yellow-on">Confirm delivery</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      {!jobs.length ? <Text className="mt-6 font-satoshi text-text-muted">No active trip. Accept an offer first.</Text> : null}
      <View className="h-12" />
    </ScrollView>
  );
}
