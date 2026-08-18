import type { ReactNode } from "react";
import { Text, View } from "react-native";

type Props = {
  /** The screen, in one or two words. Set at H1 — the loudest text here. */
  title: string;
  /** One line saying what this screen is for. Optional; never a restatement. */
  subtitle?: string | null;
  /**
   * A state this screen is in, said in a word or two. Sits inboard of the
   * control, because it is read and the control is pressed.
   */
  status?: ReactNode;
  /** A single control on the right of the title line. */
  action?: ReactNode;
};

/**
 * The top of a tab screen.
 *
 * One shape everywhere, so the eye learns where the title, the sentence and
 * the one header control live and stops re-reading them. The title sits at H1
 * against a body-large subtitle: three sizes on a screen is what stops it
 * reading as a wall of 14px.
 *
 * The title is the only thing here that gives way: it alone is `flex-1` over
 * `min-w-0`, and React Native leaves everything else unshrunk. So a long state
 * or a large font scale truncates "Active trip" rather than squeezing the chip
 * that says the account is under review — which is the right order, since the
 * tab bar is already saying which screen this is.
 */
export function ScreenHeader({ title, subtitle, status, action }: Props) {
  return (
    <View className="gap-1 pb-2">
      <View className="min-h-11 flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 text-h1 text-text-primary" numberOfLines={1}>
          {title}
        </Text>
        {status}
        {action}
      </View>
      {subtitle ? (
        <Text className="text-body-lg text-text-secondary">{subtitle}</Text>
      ) : null}
    </View>
  );
}
