import { useEffect, useId, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * How long one highlight takes to cross a placeholder.
 *
 * Deliberately outside the 160–240ms interaction budget. That budget governs a
 * response to a tap; this is ambient — it says "still working" for as long as
 * the wait lasts, and at a second per pass it reads as considered rather than
 * blinking. An opacity pulse at this size strobes; a highlight travelling
 * across the shape does not, which is why the sweep is the one that shipped.
 */
const SWEEP_MS = 1000;

const ROUND = {
  /** Text lines. */
  line: "rounded-sm",
  /** Fields and buttons. */
  field: "rounded-field",
  /** Cards, media and blocks. */
  block: "rounded-card",
  /** Avatars and chips. */
  pill: "rounded-pill",
} as const;

type Shape = keyof typeof ROUND;

type PlaceholderProps = {
  /** Width as a percentage of the row, or a fixed dp value. */
  width?: number | `${number}%`;
  height: number;
  shape: Shape;
};

/**
 * One placeholder, with the shimmer that crosses it.
 *
 * Base is `surfaceVariant`, highlight is `surfaceHigh` — white over grey in
 * Light, a lifted charcoal over a darker one in Dark. Both are already tokens,
 * so the shimmer needs no colour of its own and never touches the yellow
 * budget.
 *
 * The sweep spans the placeholder's own measured width and travels twice that,
 * so the highlight enters and leaves off the edges rather than popping. Under
 * reduced motion the gradient is not rendered at all and the shape simply sits
 * there — still a placeholder holding its space, just a silent one.
 */
function Placeholder({ width = "100%", height, shape }: PlaceholderProps) {
  const reduced = useReducedMotion();
  const colors = useThemeColors();
  // SVG ids share a document on web, and React's generated ids carry colons
  // that a `url(#…)` reference cannot take.
  const gradientId = `gg-shimmer-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const [measured, setMeasured] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduced || measured <= 0) return;
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: SWEEP_MS, easing: Easing.linear }),
      -1,
      false,
    );
  }, [progress, reduced, measured]);

  const sweep = useAnimatedStyle(() => ({
    transform: [{ translateX: -measured + progress.value * measured * 2 }],
  }));

  function onLayout(event: LayoutChangeEvent) {
    setMeasured(Math.round(event.nativeEvent.layout.width));
  }

  return (
    <View
      testID="skeleton-shape"
      onLayout={onLayout}
      style={{ width, height, overflow: "hidden" }}
      className={`${ROUND[shape]} bg-surface-variant`}
    >
      {measured > 0 && !reduced ? (
        <Animated.View
          testID="skeleton-sweep"
          style={[{ position: "absolute", left: 0, top: 0, width: measured, height }, sweep]}
          pointerEvents="none"
        >
          <Svg width={measured} height={height}>
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={colors.surfaceHigh} stopOpacity={0} />
                <Stop offset="0.5" stopColor={colors.surfaceHigh} stopOpacity={1} />
                <Stop offset="1" stopColor={colors.surfaceHigh} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width={measured} height={height} fill={`url(#${gradientId})`} />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * A line of text that has not arrived.
 *
 * Give it the width the real line will roughly be. A skeleton is only honest if
 * it is the shape of the answer: a title bar and a caption bar tell the rider a
 * card is coming, where a centred spinner tells them nothing except that
 * something, somewhere, is slow.
 */
export function SkeletonText({
  width = "100%",
  height = 14,
}: {
  width?: number | `${number}%`;
  height?: number;
}) {
  return <Placeholder width={width} height={height} shape="line" />;
}

/** An avatar, a status disc, or any round mark. */
export function SkeletonCircle({ size = 32 }: { size?: number }) {
  return <Placeholder width={size} height={size} shape="pill" />;
}

/** A card, a map, an image — anything with a card's corners. */
export function SkeletonBlock({
  width = "100%",
  height = 120,
}: {
  width?: number | `${number}%`;
  height?: number;
}) {
  return <Placeholder width={width} height={height} shape="block" />;
}

/** A fully rounded control — an answer pill, a chip, a tag. */
export function SkeletonPill({
  width = "100%",
  height = 44,
}: {
  width?: number | `${number}%`;
  height?: number;
}) {
  return <Placeholder width={width} height={height} shape="pill" />;
}

/**
 * The box a button will occupy.
 *
 * 56dp is `size="large"` on `PrimaryButton` (`min-h-14`); the field radius
 * matches it too, so the control does not appear to change shape when it
 * arrives. Pass 44 for a default-size button.
 */
export function SkeletonButton({ height = 56 }: { height?: number }) {
  return <Placeholder width="100%" height={height} shape="field" />;
}
