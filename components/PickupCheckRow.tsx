import { Check, X } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { CheckAnswer, PickupCheckDefinition } from "@/lib/pickupChecklist";

type Props = {
  index: number;
  check: PickupCheckDefinition;
  answer: CheckAnswer;
  onAnswer: (passed: boolean) => void;
  disabled?: boolean;
};

/**
 * One of the six checks, with its two answers.
 *
 * Numbered, because this genuinely is a sequence a rider works down at a
 * counter and "which one am I on" is a real question. The two answers are
 * separate targets rather than a toggle: a toggle has a default, and a default
 * on a quality check is an answer nobody gave.
 *
 * The chosen answer is a filled pill with a glyph and a word, so it survives
 * greyscale and a phone held in sunlight. Neither answer is yellow — the
 * screen's one yellow is the button that commits all six.
 */
export function PickupCheckRow({ index, check, answer, onAnswer, disabled = false }: Props) {
  const colors = useThemeColors();

  return (
    <View className="gap-3 border-b border-outline-subtle p-4">
      <View className="flex-row gap-3">
        <Text className="text-body text-text-muted">{index + 1}</Text>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-body-lg text-text-primary">{check.label}</Text>
          <Text className="text-caption text-text-muted">{check.verify}</Text>
        </View>
      </View>

      <View
        className="flex-row gap-2"
        accessibilityRole="radiogroup"
        accessibilityLabel={check.label}
      >
        <Answer
          label="Pass"
          selected={answer === true}
          disabled={disabled}
          onPress={() => onAnswer(true)}
          icon={<Check size={16} color={answer === true ? colors.accentOn : colors.textSecondary} strokeWidth={3} />}
        />
        <Answer
          label="Problem"
          selected={answer === false}
          disabled={disabled}
          onPress={() => onAnswer(false)}
          icon={<X size={16} color={answer === false ? colors.accentOn : colors.textSecondary} strokeWidth={3} />}
        />
      </View>
    </View>
  );
}

function Answer({
  label,
  selected,
  disabled,
  onPress,
  icon,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  icon: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      className={
        selected
          ? "min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-pill bg-accent px-4 py-2"
          : "min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-pill border border-outline bg-surface px-4 py-2"
      }
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      {icon}
      <Text className={selected ? "text-button text-accent-on" : "text-button text-text-secondary"}>
        {label}
      </Text>
    </Pressable>
  );
}
