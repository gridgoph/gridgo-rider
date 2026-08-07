import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SecondaryButton } from "@/components/SecondaryButton";
import {
  setThemePreference,
  useThemePreference,
  type ThemePreference,
} from "@/hooks/useTheme";
import { getApiBase } from "@/lib/api";
import { useSession } from "@/store/session";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function AccountScreen() {
  const { user, logout } = useSession();
  const preference = useThemePreference();
  const apiBase = getApiBase();

  return (
    <SafeAreaView className="gg-screen" edges={["top"]}>
      <View className="gg-page flex-1 gap-6 pt-4">
        <View>
          <Text className="text-h1 text-text-primary">Account</Text>
          <Text className="mt-1 text-body text-text-secondary">
            Identity, theme, and backend for this device.
          </Text>
        </View>

        <View className="gg-card gap-2">
          <Text className="text-overline text-text-muted">SIGNED IN</Text>
          <Text className="text-h3 text-text-primary">{user?.name ?? "—"}</Text>
          <Text className="text-body text-text-secondary">{user?.email ?? "—"}</Text>
        </View>

        <View className="gg-card gap-3">
          <Text className="text-overline text-text-muted">THEME</Text>
          <Text className="text-body text-text-secondary">
            Light and Dark are the same product. Your choice is saved on this device.
          </Text>
          <View className="flex-row gap-2">
            {THEME_OPTIONS.map((option) => {
              const selected = option.value === preference;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setThemePreference(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={
                    selected
                      ? "gg-chip gg-touch border-accent bg-accent px-4"
                      : "gg-chip gg-touch bg-surface px-4"
                  }
                >
                  <Text
                    className={
                      selected
                        ? "text-caption text-accent-on"
                        : "text-caption text-text-primary"
                    }
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

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
