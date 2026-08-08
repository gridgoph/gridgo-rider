import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { getApiBase } from "@/lib/api";
import { useSession } from "@/store/session";

export default function AccountScreen() {
  const { user, logout } = useSession();
  const colors = useThemeColors();
  const apiBase = getApiBase();

  return (
    <SafeAreaView className="gg-screen" edges={["top"]}>
      <View className="gg-page flex-1 gap-6 pt-4">
        <View>
          <Text className="text-h1 text-text-primary">Account</Text>
          <Text className="mt-1 text-body text-text-secondary">
            Identity and backend for this device.
          </Text>
        </View>

        <View className="gg-card gap-2">
          <Text className="text-overline text-text-muted">SIGNED IN</Text>
          <Text className="text-h3 text-text-primary">{user?.name ?? "—"}</Text>
          <Text className="text-body text-text-secondary">{user?.email ?? "—"}</Text>
        </View>

        {/* Destination row — not a primary action. Chevron marks the push. */}
        <Pressable
          onPress={() => router.push("/settings")}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          accessibilityHint="Opens device preferences and onboarding"
          className="gg-card min-h-11 flex-row items-center justify-between"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Text className="text-body text-text-primary">Settings</Text>
          <ChevronRight size={20} color={colors.textMuted} accessibilityElementsHidden />
        </Pressable>

        <View className="gg-card gap-2">
          <Text className="text-overline text-text-muted">BACKEND</Text>
          <Text className="text-body text-text-primary" selectable>
            {apiBase}
          </Text>
          <Text className="text-caption text-text-muted">
            Resolved from EXPO_PUBLIC_API_URL or the Expo dev host. Demo API only.
          </Text>
        </View>

        <SecondaryButton label="Sign out" onPress={() => void logout()} />
      </View>
    </SafeAreaView>
  );
}
