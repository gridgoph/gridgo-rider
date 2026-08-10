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

  return (
    <SafeAreaView className="gg-screen" edges={["top"]}>
      <View className="gg-page flex-1 gap-6 pt-6">
        <View className="gap-2">
          <Text className="text-h1 text-text-primary">Account</Text>
          <Text className="text-body-lg text-text-secondary">
            Who this phone is signed in as.
          </Text>
        </View>

        <View className="gg-card gap-1">
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

        <SecondaryButton label="Sign out" onPress={() => void logout()} />

        {/*
          Kept, but demoted to a footnote: the rider cannot act on it, and it
          only earns its place because this build talks to a demo server that
          moves between machines.
        */}
        <View className="mt-auto gap-1 pb-6">
          <Text className="text-caption text-text-muted">Connected to</Text>
          <Text className="text-caption text-text-secondary" selectable>
            {getApiBase()}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
