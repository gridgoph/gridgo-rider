import { router } from "expo-router";
import { PictureInPicture2, PlayCircle } from "lucide-react-native";
import { useEffect } from "react";
import { ScrollView, Text, View } from "react-native";

import { DestinationRow } from "@/components/DestinationRow";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import {
  setThemePreference,
  useThemePreference,
  type ThemePreference,
} from "@/hooks/useTheme";
import { bubbleSettingsRow, openBubbleSettings } from "@/lib/tripBubble";
import { useBubblePermission } from "@/store/bubblePermission";

const THEME_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

/**
 * Device preferences for the signed-in rider.
 *
 * Theme is local only (no network). Onboarding replay is a static screen —
 * no empty, loading, or failed states to show for either control. The delivery
 * bubble row exists only on a phone that can draw one (Android); its value is
 * re-read when the rider comes back from the phone's settings.
 */
export default function SettingsScreen() {
  const preference = useThemePreference();
  const bubble = useBubblePermission((s) => s.permission);
  const bubbleRow = bubble === "unavailable" ? null : bubbleSettingsRow(bubble);

  useEffect(() => {
    router.prefetch("/onboarding");
  }, []);

  return (
    <Screen edges={["bottom"]}>
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

        {bubbleRow ? (
          <View className="gg-card-flush">
            <DestinationRow
              icon={PictureInPicture2}
              label="Delivery bubble"
              value={bubbleRow.value}
              detail={bubbleRow.detail}
              onPress={() => void openBubbleSettings()}
              last
            />
          </View>
        ) : null}

        <View className="gg-card-flush">
          <DestinationRow
            icon={PlayCircle}
            label="View onboarding"
            detail="Replay the introduction for this app"
            onPress={() =>
              router.push({ pathname: "/onboarding", params: { from: "settings" } })
            }
            last
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
