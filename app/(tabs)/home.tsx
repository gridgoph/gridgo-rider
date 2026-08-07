import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { GridgoLogo } from "@/components/GridgoLogo";
import * as api from "@/lib/api";
import { useSession } from "@/store/session";

export default function HomeScreen() {
  const { user } = useSession();
  const [offers, setOffers] = useState<api.Order[]>([]);
  const [active, setActive] = useState<api.Order[]>([]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          const list = await api.listOffers();
          if (!alive) return;
          setOffers(list.filter((o) => o.state === "ready_for_dispatch"));
          setActive(list.filter((o) => o.riderId && o.state !== "ready_for_dispatch"));
        } catch {
          if (alive) {
            setOffers([]);
            setActive([]);
          }
        }
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  return (
    <View className="flex-1 bg-canvas px-5 pt-14">
      <GridgoLogo />
      <Text className="mt-4 font-satoshi-bold text-2xl text-text-primary">Hi, {user?.name?.split(" ")[0] || "Rider"}</Text>
      <Text className="mt-1 font-satoshi text-text-secondary">Pickup, deliver, collect COD proof</Text>
      <View className="mt-6 flex-row gap-3">
        <View className="flex-1 rounded-2xl border border-outline bg-surface p-4">
          <Text className="font-satoshi text-text-muted">Open offers</Text>
          <Text className="mt-1 font-satoshi-bold text-3xl text-text-primary">{offers.length}</Text>
        </View>
        <View className="flex-1 rounded-2xl border border-outline bg-surface p-4">
          <Text className="font-satoshi text-text-muted">Active trips</Text>
          <Text className="mt-1 font-satoshi-bold text-3xl text-text-primary">{active.length}</Text>
        </View>
      </View>
    </View>
  );
}
