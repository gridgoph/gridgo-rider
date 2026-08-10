import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SegmentedControl } from "@/components/SegmentedControl";
import {
  setThemePreference,
  useThemeColors,
  useThemePreference,
  type ThemePreference,
} from "@/hooks/useTheme";

const THEME_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
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
          <SegmentedControl
            label="Theme"
            segments={THEME_OPTIONS}
            value={preference}
            onChange={setThemePreference}
          />
          <Text className="text-caption text-text-muted">
            Light and Dark are the same product. Your choice is saved on this phone.
          </Text>
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
