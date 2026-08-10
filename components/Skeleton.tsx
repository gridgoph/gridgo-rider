import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { motion } from "@/constants/theme";

type BarProps = {
  /** Width as a percentage of the row, or a fixed dp value. */
  width?: number | `${number}%`;
  height?: number;
  /** Pill for chips and buttons, field for blocks. */
  round?: "field" | "pill";
};

/**
 * A single placeholder bar, sized like the text it stands in for.
 *
 * A skeleton is only honest if it is the shape of the answer: bars the width
 * of a title and a caption tell the rider a card is coming, where a centred
 * spinner tells them nothing except that something, somewhere, is slow.
 *
 * The pulse is one shared 900ms fade, well outside the 160–240ms interaction
 * budget on purpose — it is ambient, not a response — and it stops dead under
 * reduced motion, where the bars simply sit at their mid opacity.
 */
export function SkeletonBar({ width = "100%", height = 14, round = "field" }: BarProps) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    if (reduced) {
      pulse.value = 0.5;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [pulse, reduced]);

  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[{ width, height }, style]}
      className={
        round === "pill"
          ? "rounded-pill bg-surface-variant"
          : "rounded-field bg-surface-variant"
      }
    />
  );
}

type LoadingCardProps = {
  /** What is loading, said plainly for screen readers and slow connections. */
  label: string;
  /** How many placeholder rows to draw. */
  rows?: number;
};

/**
 * The shape of a card that has not arrived yet.
 *
 * Announced once to assistive technology; drawn as the card's own skeleton for
 * everyone else. Both matter — this is most of what a rider on a weak signal
 * outside a Davao print shop actually sees.
 */
export function LoadingCard({ label, rows = 3 }: LoadingCardProps) {
  return (
    <View
      className="gg-card gap-3"
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
    >
      <SkeletonBar width="62%" height={20} />
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonBar
          key={index}
          width={index === rows - 1 ? "45%" : "100%"}
          height={14}
        />
      ))}
    </View>
  );
}

/** Duration tokens re-exported so screens never hand-roll a timing. */
export const skeletonMotion = motion;
