import { Pressable, Text, View, type PressableProps } from "react-native";

type Props = {
  label: string;
  onPress?: PressableProps["onPress"];
  disabled?: boolean;
  /**
   * Match PrimaryButton `large` height when the two sit as a pair in a sheet.
   */
  size?: "default" | "large";
};

/**
 * The button for an action that cannot be undone.
 *
 * Yellow is the reward colour for the step a rider wants to take, so a sign-out
 * never wears it. This carries the error token on its border and label, which
 * keeps the meaning legible in greyscale next to the neutral "stay" choice.
 */
export function DangerButton({ label, onPress, disabled, size = "default" }: Props) {
  const large = size === "large";
  const box = disabled
    ? `${large ? "min-h-14" : "h-11 min-w-11"} flex-row items-center justify-center rounded-field border border-error bg-surface-variant px-4`
    : large
      ? "min-h-14 flex-row items-center justify-center rounded-field border border-error bg-surface px-4"
      : "gg-btn border border-error bg-surface";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      className={disabled ? `${box} gg-disabled` : box}
    >
      {({ pressed }) => (
        <>
          <Text className={large ? "text-body-lg font-bold text-error" : "text-button text-error"}>
            {label}
          </Text>
          {pressed ? <View className="gg-pressed absolute inset-0 rounded-field" /> : null}
        </>
      )}
    </Pressable>
  );
}
