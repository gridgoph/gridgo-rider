import { Store, UserRound } from "lucide-react-native";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useTheme";
import type { CallRole } from "@/lib/orderCalls";

type Props = {
  role: CallRole;
  /** A slow ring spreads outward while the call is ringing — in or out. */
  ringing?: boolean;
  size?: number;
};

/**
 * Who is on the other end, as a shape: a person for the client, a storefront
 * for the shop — the same glyphs their two conversations carry on the trip, so
 * a rider who has only half-looked still knows which call this is.
 *
 * The spreading ring is decoration over a state the screen also says in words
 * ("Ringing…"), so it is simply absent under reduced motion.
 */
export function CallAvatar({ role, ringing = false, size = 136 }: Props) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  const Icon = role === "supplier" ? Store : UserRound;
  const animate = ringing && !reducedMotion;

  useEffect(() => {
    if (!animate) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(pulse);
  }, [animate, pulse]);

  const ring = useAnimatedStyle(() => ({
    opacity: 0.35 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 0.32 }],
  }));

  return (
    <View
      style={{ width: size * 1.4, height: size * 1.4 }}
      className="items-center justify-center"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {animate ? (
        <Animated.View
          style={[
            { position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accent },
            ring,
          ]}
        />
      ) : null}
      <View
        className="items-center justify-center rounded-pill border-2 border-accent bg-surface"
        style={{ width: size, height: size }}
      >
        <Icon size={Math.round(size * 0.4)} color={colors.textPrimary} strokeWidth={1.75} />
      </View>
    </View>
  );
}
