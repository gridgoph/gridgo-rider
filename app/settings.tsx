import { router } from "expo-router";
import { PlayCircle } from "lucide-react-native";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DestinationRow } from "@/components/DestinationRow";
import { SegmentedControl } from "@/components/SegmentedControl";
import {
  setThemePreference,
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

  return (
    <SafeAreaView className="gg-screen" edges={["bottom"]}>
      <ScrollView className="flex-1" contentContainerClassName="gg-page gap-6 pb-10 pt-4">
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

        <View className="gg-card-flush">
          <DestinationRow
            icon={PlayCircle}
            label="View onboarding"
            detail="Replay the three-slide introduction for this app"
            onPress={() =>
              router.push({ pathname: "/onboarding", params: { from: "settings" } })
            }
            last
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
