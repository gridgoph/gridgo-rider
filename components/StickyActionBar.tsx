import type { ReactNode } from "react";
import { View } from "react-native";

type Props = {
  children: ReactNode;
};

/**
 * The screen's action, pinned above the tab bar.
 *
 * A rider reads this screen at a junction with one hand on the bars. The step
 * that moves the job forward cannot be something they have to scroll a map, a
 * spec table and a timeline to reach — it lives here, in the same place on
 * every trip screen, always one thumb away.
 *
 * A hairline and the surface, not a shadow: a border carries this separation
 * and stays visible in Dark, where a shadow over a black canvas is nothing.
 */
export function StickyActionBar({ children }: Props) {
  return (
    <View className="border-t border-outline bg-surface px-4 pb-3 pt-3">
      <View className="gap-2">{children}</View>
    </View>
  );
}
