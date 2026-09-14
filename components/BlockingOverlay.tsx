import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useTheme";
import { motion } from "@/constants/theme";

type Props = {
  visible: boolean;
  /** What is happening, in the rider's terms: "Recording the pickup…". */
  label: string;
};

/**
 * Work the rider must not interrupt, over the screen that started it.
 *
 * A skeleton is for content that has not arrived; this is the other case — the
 * screen is complete, the rider has committed, and the answer is in flight.
 * Disabling the button alone is not enough on a proof screen: the six check
 * answers, the failure note and the camera all stay live underneath, and a
 * rider who changes a Pass to a Problem mid-submit is filing evidence that no
 * longer matches what was sent.
 *
 * So it is a scrim with a centred indicator, exactly the shape the legacy app
 * used for the same job, and it swallows touches for as long as the commit
 * runs. The fade is 160ms and goes away entirely under reduced motion; the
 * scrim itself never does, because it is carrying state, not decoration.
 */
export function BlockingOverlay({ visible, label }: Props) {
  const colors = useThemeColors();
  const reduced = useReducedMotion();

  if (!visible) return null;

  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(motion.fast)}
      exiting={reduced ? undefined : FadeOut.duration(motion.fast)}
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: colors.scrim,
          alignItems: "center",
          justifyContent: "center",
        },
      ]}
      accessibilityViewIsModal
      accessibilityLiveRegion="polite"
      // Announced as one thing; the label below is the same sentence on screen.
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <View className="items-center gap-3 rounded-card bg-surface px-6 py-5">
        <ActivityIndicator size="large" color={colors.accent} />
        <Text className="text-body text-text-primary">{label}</Text>
      </View>
    </Animated.View>
  );
}
