import { Check } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

export type Choice<T extends string> = {
  id: T;
  label: string;
  /** One line saying when this is the right answer. */
  helper?: string;
};

type Props<T extends string> = {
  label: string;
  choices: readonly Choice<T>[];
  value: T | null;
  onChange: (id: T) => void;
  disabled?: boolean;
};

/**
 * Single choice from a fixed set the backend already defines.
 *
 * A list rather than a segmented control on purpose: five reasons with a line
 * of guidance each will not fit in segments, and a rider standing at a gate in
 * the rain needs a target they can hit without looking twice. Selection is a
 * tick and a heavier border, never colour alone.
 */
export function ChoiceList<T extends string>({
  label,
  choices,
  value,
  onChange,
  disabled = false,
}: Props<T>) {
  const colors = useThemeColors();

  return (
    <View className="gap-3" accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text className="text-overline text-text-muted">{label.toUpperCase()}</Text>
      <View className="gap-2">
        {choices.map((choice) => {
          const selected = choice.id === value;
          return (
            <Pressable
              key={choice.id}
              onPress={() => onChange(choice.id)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={choice.label}
              accessibilityHint={choice.helper}
              className={
                selected
                  ? "min-h-14 flex-row items-center gap-3 rounded-field border-2 border-accent bg-surface-high px-4 py-3"
                  : "min-h-14 flex-row items-center gap-3 rounded-field border border-outline bg-surface px-4 py-3"
              }
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            >
              <View
                className={
                  selected
                    ? "h-6 w-6 items-center justify-center rounded-pill bg-accent"
                    : "h-6 w-6 items-center justify-center rounded-pill border border-outline"
                }
              >
                {selected ? <Check size={14} color={colors.accentOn} strokeWidth={3} /> : null}
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-body-lg text-text-primary">{choice.label}</Text>
                {choice.helper ? (
                  <Text className="mt-0.5 text-caption text-text-muted">{choice.helper}</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
