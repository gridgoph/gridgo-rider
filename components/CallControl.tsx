import type { LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  /** The word under the disc. Always shown — an icon alone is a guess. */
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  /**
   * `answer` is the call's one yellow, `end` is red, and everything else is a
   * monochrome toggle that fills when it is on.
   */
  tone?: "neutral" | "answer" | "end";
  /** For a toggle: whether it is on. Read out as a switch. */
  on?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

/** Disc edge. Well above the 44dp floor: these are pressed one-handed, often in a glove. */
export const CALL_CONTROL_SIZE = 72;

/**
 * One round call control with its label beneath, the shape every phone's call
 * screen has taught people to look for. Toggles (Mute, Speaker) announce as
 * switches with their state, so a screen reader hears "Mute, on".
 */
export function CallControl({
  label,
  icon: Icon,
  onPress,
  tone = "neutral",
  on,
  disabled,
  accessibilityLabel,
  accessibilityHint,
}: Props) {
  const colors = useThemeColors();
  const toggle = on !== undefined;
  const fill =
    tone === "answer"
      ? colors.actionYellow
      : tone === "end"
        ? colors.error
        : on
          ? colors.accent
          : colors.surfaceVariant;
  const ink =
    tone === "answer" ? colors.actionYellowOn : tone === "end" || on ? colors.accentOn : colors.textPrimary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={toggle ? "switch" : "button"}
      accessibilityState={toggle ? { checked: Boolean(on), disabled: Boolean(disabled) } : { disabled: Boolean(disabled) }}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      className="items-center gap-2"
      style={{ width: 104, opacity: disabled ? 0.45 : 1 }}
    >
      {({ pressed }) => (
        <>
          <View
            className="items-center justify-center rounded-pill"
            style={{
              width: CALL_CONTROL_SIZE,
              height: CALL_CONTROL_SIZE,
              backgroundColor: fill,
              borderWidth: tone === "neutral" && !on ? 1 : 0,
              borderColor: colors.outline,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            }}
          >
            <Icon size={30} color={ink} strokeWidth={2} />
          </View>
          <Text className="text-center text-body font-medium text-text-primary">{label}</Text>
        </>
      )}
    </Pressable>
  );
}
