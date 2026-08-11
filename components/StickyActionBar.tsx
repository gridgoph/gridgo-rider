import type { ReactNode } from "react";
import { View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  /**
   * Called with this bar's measured height. Hand it to `FormScroll` so a
   * focused field clears the bar as well as the keyboard.
   */
  onHeight?: (height: number) => void;
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
 *
 * It rides the keyboard, so "always one thumb away" survives a rider typing.
 * The pickup escalation cannot be filed without a sentence *and* the button
 * that files it, and a rider who has to dismiss the keyboard to find the
 * button has been handed a puzzle at the worst moment of the job.
 *
 * The `opened` offset is the bottom safe-area inset, not a nudge. `Screen`
 * has already lifted this bar clear of the system bar; the keyboard's height
 * is measured from the bottom of the window and therefore counts that same
 * strip again, so without subtracting it the bar floats one inset too high.
 */
export function StickyActionBar({ onHeight, children }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
      <View
        className="border-t border-outline bg-surface px-4 pb-3 pt-3"
        onLayout={(event) => onHeight?.(event.nativeEvent.layout.height)}
      >
        <View className="gap-2">{children}</View>
      </View>
    </KeyboardStickyView>
  );
}
