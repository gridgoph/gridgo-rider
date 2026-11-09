import { CircleFadingArrowUp } from "lucide-react-native";
import { useEffect, useState } from "react";
import { BackHandler, Linking, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/PrimaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { installChannel } from "@/lib/buildDistribution";
import { UPDATE_REQUIRED_COPY as COPY } from "@/lib/minimumBuild";
import { tryOpenDestination, updateDestination } from "@/lib/releasePush";
import { useUpdateRequired } from "@/store/updateRequired";

type Props = {
  /**
   * `full`: nothing is in hand and the whole app is closed. `step`: a job is
   * in hand, so only this custody step is, and the copy says the trip is safe.
   */
  variant: "full" | "step";
};

/**
 * "Update GRIDGO", and the one button that does it (`lib/minimumBuild.ts`).
 *
 * One glyph, one line, one yellow button. The button opens this install's own
 * way to update — the Play listing, the side-load APK, or TestFlight — and
 * never another channel's. The installed version sits under it in muted type,
 * for whoever the rider calls.
 */
export function UpdateRequiredPanel({ variant }: Props) {
  const colors = useThemeColors();
  const installed = useUpdateRequired((s) => s.installed);
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);

  async function update() {
    setOpening(true);
    setFailed(false);
    const opened = await tryOpenDestination(updateDestination(installChannel()), (url) =>
      Linking.openURL(url),
    );
    setFailed(!opened);
    setOpening(false);
  }

  return (
    <View className="flex-1 items-center justify-center gap-6 px-4">
      <View
        className="h-24 w-24 items-center justify-center rounded-pill border border-outline bg-surface"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <CircleFadingArrowUp size={44} color={colors.textPrimary} strokeWidth={1.75} />
      </View>
      <View className="w-full max-w-80 items-center gap-2">
        <Text accessibilityRole="header" className="text-center text-h2 text-text-primary">
          {COPY.title}
        </Text>
        <Text className="text-center text-body-lg text-text-secondary">
          {variant === "full" ? COPY.fullBody : COPY.stepBody}
        </Text>
      </View>
      <View className="w-full max-w-80 gap-3">
        <PrimaryButton
          label={opening ? COPY.opening : COPY.action}
          size="large"
          disabled={opening}
          onPress={() => void update()}
        />
        {failed ? (
          <Text accessibilityLiveRegion="polite" className="text-center text-body text-error">
            {COPY.openFailed}
          </Text>
        ) : installed ? (
          <Text className="text-center text-caption text-text-muted">
            {COPY.installed(installed.versionName)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The whole-app block: over every screen, swallowing touches and the Android
 * back button. Drawn over the navigator rather than replacing it, so nothing
 * under it unmounts and nothing typed is lost.
 */
export function UpdateRequiredOverlay() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: colors.canvas,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
      accessibilityViewIsModal
    >
      <UpdateRequiredPanel variant="full" />
    </View>
  );
}
