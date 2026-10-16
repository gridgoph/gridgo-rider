import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonButton } from "@/components/Skeleton";
import { spacing } from "@/constants/theme";

type Props = {
  /**
   * Called with this bar's measured height. Hand it to `FormScroll` so a
   * focused field clears the bar as well as the keyboard.
   */
  onHeight?: (height: number) => void;
  /**
   * One line about the action: what it does, or what it still needs. Always
   * read above the button, never below it.
   */
  note?: string | null;
  /** The step's one action. */
  children: ReactNode;
};

/**
 * The step's action, pinned to the bottom of every proof step.
 *
 * A rider reads these screens at a junction with one hand on the bars. The step
 * that moves the job forward cannot be something they have to scroll a map, a
 * spec table and a timeline to reach — it lives here, always one thumb away.
 *
 * Same place on every step, not merely the same bar (gridgo-rider#117). The
 * button is always the last thing in the bar, and anything said about it goes
 * above: with the note under the button on some steps and not others, the
 * button rose and fell from step to step, and a rider moving through the job
 * found it somewhere new each time. Fixed to the bottom edge, a longer note —
 * or text at 1.3× — grows the bar upward and leaves the button where the thumb
 * already is.
 *
 * The bar paints its own bottom safe area, so its surface reaches the edge of
 * the screen rather than floating over a strip of canvas. Screens that use it
 * open `Screen` without the bottom edge for that reason.
 *
 * A hairline and the surface, not a shadow: a border carries this separation
 * and stays visible in Dark, where a shadow over a black canvas is nothing.
 *
 * It rides the keyboard, so "always one thumb away" survives a rider typing.
 * The pickup escalation cannot be filed without a sentence *and* the button
 * that files it, and a rider who has to dismiss the keyboard to find the
 * button has been handed a puzzle at the worst moment of the job.
 *
 * The `opened` offset is the bottom safe-area inset, not a nudge. The keyboard
 * covers that strip, so the bar's own inset padding goes under the keyboard
 * and the button keeps the same 12dp above the keys as it has above the edge.
 */
export function StickyActionBar({ onHeight, note, children }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
      <View
        className="gap-2 border-t border-outline bg-surface px-4 pt-3"
        style={{ paddingBottom: spacing.md + insets.bottom }}
        onLayout={(event) => onHeight?.(event.nativeEvent.layout.height)}
      >
        {note ? <Text className="text-center text-body text-text-secondary">{note}</Text> : null}
        {children}
      </View>
    </KeyboardStickyView>
  );
}

/**
 * What the bar holds while the step's job is not on screen.
 *
 * The slot never empties: a held button while the job loads, so the real one
 * arrives where it was going to be, and the way back once it has failed to load,
 * in the place the rider is already reaching for.
 */
export function StickyActionFallback({
  loading,
  onBack,
}: {
  loading: boolean;
  onBack: () => void;
}) {
  return loading ? (
    <SkeletonButton />
  ) : (
    <SecondaryButton label="Back to the trip" onPress={onBack} size="large" />
  );
}
