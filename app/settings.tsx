import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  setThemePreference,
  useThemeColors,
  useThemePreference,
  type ThemePreference,
} from "@/hooks/useTheme";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/**
 * Device preferences for the signed-in rider.
 *
 * Theme is local only (no network). Onboarding replay is a static screen —
 * no empty, loading, or failed states to show for either control.
 */
export default function SettingsScreen() {
  const preference = useThemePreference();
  const colors = useThemeColors();

  return (
    <SafeAreaView className="gg-screen" edges={["bottom"]}>
      <View className="gg-page flex-1 gap-6 pt-4">
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
                  accessibilityLabel={`${option.label} theme`}
                  className={
                    selected
                      ? "gg-chip gg-touch border-accent bg-accent px-4"
                      : "gg-chip gg-touch bg-surface-variant px-4"
                  }
                  style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
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

        <Pressable
          onPress={() =>
            router.push({ pathname: "/onboarding", params: { from: "settings" } })
          }
          accessibilityRole="button"
          accessibilityLabel="View onboarding"
          accessibilityHint="Opens the rider introduction slides"
          className="gg-card min-h-11 flex-row items-center justify-between"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <View className="flex-1 pr-3">
            <Text className="text-body text-text-primary">View onboarding</Text>
            <Text className="mt-1 text-caption text-text-muted">
              Replay the three-slide introduction for this app.
            </Text>
          </View>
          <ChevronRight size={20} color={colors.textMuted} accessibilityElementsHidden />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
