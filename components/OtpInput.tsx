import { Text, TextInput, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  label: string;
  /** Who the rider gets the code from. */
  helper: string;
  disabled?: boolean;
};

/**
 * A fixed-length numeric handover code.
 *
 * Shown as one box per digit rather than a plain text field: at a shop counter,
 * in sunlight, a rider needs to see at a glance how many digits are in and
 * whether they read the code right. A single field hides both.
 *
 * One real TextInput sits invisibly over the boxes, so the platform keypad,
 * paste, and one-time-code autofill all behave normally. The boxes are only the
 * presentation; the input is the control, and it carries the accessible name.
 */
export function OtpInput({
  value,
  onChange,
  length = 4,
  label,
  helper,
  disabled = false,
}: Props) {
  const colors = useThemeColors();
  const digits = value.slice(0, length).split("");
  const caretIndex = Math.min(digits.length, length - 1);

  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text className="text-overline text-text-muted">{label.toUpperCase()}</Text>
        <Text className="text-body text-text-secondary">{helper}</Text>
      </View>

      <View className="relative">
        <View className="flex-row gap-3" accessible={false}>
          {Array.from({ length }).map((_, index) => {
            const filled = index < digits.length;
            const atCaret = !disabled && index === caretIndex && digits.length < length;
            return (
              <View
                key={index}
                importantForAccessibility="no-hide-descendants"
                className={
                  atCaret
                    ? "h-16 flex-1 items-center justify-center rounded-field border-2 border-accent bg-surface"
                    : filled
                      ? "h-16 flex-1 items-center justify-center rounded-field border border-accent bg-surface"
                      : "h-16 flex-1 items-center justify-center rounded-field border border-outline bg-surface-variant"
                }
              >
                <Text className="text-h2 text-text-primary">{digits[index] ?? ""}</Text>
              </View>
            );
          })}
        </View>

        <TextInput
          value={value}
          onChangeText={(next) => onChange(next.replace(/\D/g, "").slice(0, length))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={length}
          editable={!disabled}
          caretHidden
          accessibilityLabel={label}
          accessibilityHint={helper}
          selectionColor={colors.accent}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: 0,
          }}
        />
      </View>
    </View>
  );
}
