import type { ReactNode } from "react";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { useThemeColors } from "@/hooks/useTheme";

/**
 * The screen shell: full-bleed canvas, inset on the edges the screen asks for.
 *
 * Every screen opens with this, and none of them reach for `SafeAreaView`
 * directly, because `className` does not reach it.
 *
 * NativeWind styles a component by *replacing* it: the Metro alias swaps
 * `react-native`'s exports for styled ones (`react-native-css/components`).
 * `SafeAreaView` comes from `react-native-safe-area-context`, which is not in
 * that set, so a `className` on it is silently dropped — no error, no warning.
 * `gg-screen` carries `flex-1`, so losing it collapsed the shell to the height
 * of its own insets and every `flex: 1` child inside it measured zero. The app
 * rendered a blank canvas on device.
 *
 * Web hid it completely: react-native-web forwards `className` to the DOM node,
 * where the compiled stylesheet applies it for real. So the same code laid out
 * correctly in a browser and showed nothing on a phone.
 *
 * Hence tokens through `style` here rather than a class. If a third-party
 * component ever needs GRIDGO styling again, wrap it once like this — do not
 * hand it a `className` and assume it landed.
 */
export function Screen({
  edges,
  children,
}: {
  /** Which insets to apply. Omit for all four. */
  edges?: readonly Edge[];
  children: ReactNode;
}) {
  const colors = useThemeColors();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={edges}>
      {children}
    </SafeAreaView>
  );
}
