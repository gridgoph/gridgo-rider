import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Whether the phone asks for less animation.
 *
 * GRIDGO spends its motion budget on one moment per flow, and that moment has
 * to disappear entirely for anyone who has turned motion down. No state is ever
 * carried by animation alone, so removing it costs nothing.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (!cancelled) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduced;
}
