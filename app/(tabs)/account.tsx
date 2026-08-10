import { useRouter } from "expo-router";
import { Bell, Settings2 } from "lucide-react-native";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DestinationRow } from "@/components/DestinationRow";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useNotifications } from "@/store/notifications";
import { useSession } from "@/store/session";

/** First letter of the rider's name, for the identity mark. */
function initial(name: string | undefined): string {
  return (name?.trim()[0] ?? "?").toUpperCase();
}

/**
 * Who this phone is signed in as, and the way to everything that is not a
 * daily destination.
 */
export default function AccountScreen() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const unread = useNotifications((s) => s.unread);

  return (
    <SafeAreaView className="gg-screen" edges={["top"]}>
      <ScrollView className="flex-1" contentContainerClassName="gg-page gap-6 pb-10 pt-3">
        <ScreenHeader title="Account" />

        <View className="gg-card flex-row items-center gap-4">
          <View className="h-14 w-14 items-center justify-center rounded-pill bg-accent">
            <Text className="text-h3 text-accent-on">{initial(user?.name)}</Text>
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-h3 text-text-primary" numberOfLines={1}>
              {user?.name ?? "Signed out"}
            </Text>
            <Text className="text-body text-text-secondary" numberOfLines={1}>
              {user?.email ?? "—"}
            </Text>
            <Text className="text-caption text-text-muted">GRIDGO rider</Text>
          </View>
        </View>

        <View className="gg-card-flush">
          <DestinationRow
            icon={Bell}
            label="Alerts"
            detail="Everything dispatch has sent you"
            value={unread > 0 ? `${unread} unread` : null}
            onPress={() => router.push("/alerts")}
          />
          <DestinationRow
            icon={Settings2}
            label="Settings"
            detail="Theme, and the introduction slides"
            onPress={() => router.push("/settings")}
            last
          />
        </View>

        <SecondaryButton label="Sign out" onPress={() => void logout()} />
      </ScrollView>
    </SafeAreaView>
  );
}
