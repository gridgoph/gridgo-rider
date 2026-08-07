import { Pressable, Text, View, type PressableProps } from "react-native";

type Props = {
  /** A clear verb. "Approve & Continue", not "Submit". */
  label: string;
  onPress?: PressableProps["onPress"];
  disabled?: boolean;
  /**
   * Large target for outdoor, one-handed trip actions (well above 44dp).
   * Use on Active primary CTAs only.
   */
  size?: "default" | "large";
};

/**
 * The one primary action on a screen or bounded panel.
 *
 * Yellow is a finite attention budget. If a screen already has a
 * PrimaryButton, every other action on it is a SecondaryButton.
 */
export function PrimaryButton({ label, onPress, disabled, size = "default" }: Props) {
  const box =
    size === "large"
      ? disabled
        ? "min-h-14 flex-row items-center justify-center rounded-field bg-action-yellow px-4 gg-disabled"
        : "min-h-14 flex-row items-center justify-center rounded-field bg-action-yellow px-4"
      : disabled
        ? "gg-btn-primary gg-disabled"
        : "gg-btn-primary";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      className={box}
    >
      {({ pressed }) => (
        <>
          <Text
            className={
              size === "large"
                ? "text-body-lg font-bold text-action-yellow-on"
                : "text-button text-action-yellow-on"
            }
          >
            {label}
          </Text>
          {pressed ? <View className="gg-pressed absolute inset-0 rounded-field" /> : null}
        </>
      )}
    </Pressable>
  );
}
